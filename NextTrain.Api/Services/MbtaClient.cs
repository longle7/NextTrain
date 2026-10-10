using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// The only code that talks to the MBTA API. Every method follows the same pattern:
    ///   1. Build the MBTA URL for what we need (filters narrow it to the subway; "fields" trims the payload).
    ///   2. GetCachedAsync: return the cached copy if it's fresh enough, otherwise call MBTA and cache the answer.
    ///   3. Reshape MBTA's JSON (via the DTO classes in NextTrain.Core) into what callers want.
    /// Cache times are the constants below. Errors (MBTA down, timeout) are not caught here: they bubble up to
    /// MbtaUnavailableFilter, which turns them into a 503.
    /// </summary>
    public class MbtaClient : IMbtaClient
    {
        // Matches the web app's 10s refresh. Needs an MBTA API key under load (keyless limit is 20 requests/minute).
        public static readonly TimeSpan PredictionCacheDuration = TimeSpan.FromSeconds(10);

        // Route names and colors almost never change.
        public static readonly TimeSpan RouteCacheDuration = TimeSpan.FromHours(1);

        // Alerts change within minutes, not seconds.
        public static readonly TimeSpan AlertCacheDuration = TimeSpan.FromMinutes(1);

        // MBTA JSON uses snake_case (e.g., "arrival_time", "platform_code").
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true
        };

        private readonly HttpClient _httpClient;
        private readonly IMemoryCache _cache;
        private readonly string? _apiKey;

        public MbtaClient(HttpClient httpClient, IConfiguration configuration, IMemoryCache cache)
        {
            _httpClient = httpClient;
            _cache = cache;

            // Optional API key (Mbta:ApiKey in configuration). Sent as a header on every request; see GetAsync.
            _apiKey = configuration["Mbta:ApiKey"];
        }

        public async Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId, int? directionId = null)
        {
            // Returned in line order. Cached like routes: stations almost never change.
            var payload = await GetCachedAsync<MbtaStopsResponseDto>(
                $"https://api-v3.mbta.com/stops?filter[route]={Uri.EscapeDataString(routeId)}" +
                (directionId is null ? "" : $"&filter[direction_id]={directionId}"), RouteCacheDuration);

            return payload?.Data ?? new List<MbtaStopDto>();
        }

        public async Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds)
        {
            var url = $"https://api-v3.mbta.com/predictions?filter[stop]={Uri.EscapeDataString(mbtaStopId)}" +
                      $"&filter[route]={Uri.EscapeDataString(routeIds)}";

            var payload = await GetCachedAsync<MbtaPredictionsResponseDto>(url, PredictionCacheDuration);
            return payload?.Data ?? new List<MbtaPredictionDto>();
        }

        public async Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync()
        {
            var payload = await GetCachedAsync<MbtaRoutesResponseDto>(
                "https://api-v3.mbta.com/routes?filter[type]=0,1", RouteCacheDuration);
            return payload?.Data.OrderBy(r => r.Attributes.SortOrder).ToList() ?? new List<MbtaRouteDto>();
        }

        public async Task<IReadOnlyList<MbtaRouteDto>> GetBusRoutesAsync()
        {
            var payload = await GetCachedAsync<MbtaRoutesResponseDto>(
                "https://api-v3.mbta.com/routes?filter[type]=3", RouteCacheDuration);
            return payload?.Data.OrderBy(r => r.Attributes.SortOrder).ToList() ?? new List<MbtaRouteDto>();
        }

        public Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync() =>
            GetVehiclesAsync("filter[route_type]=0,1");

        public Task<IReadOnlyList<MbtaVehicle>> GetRouteVehiclesAsync(string routeIds) =>
            GetVehiclesAsync($"filter[route]={Uri.EscapeDataString(routeIds)}");

        private async Task<IReadOnlyList<MbtaVehicle>> GetVehiclesAsync(string filter)
        {
            var payload = await GetCachedAsync<MbtaIncludeResponseDto>(
                $"https://api-v3.mbta.com/vehicles?{filter}&include=stop&fields[stop]=name" +
                "&fields[vehicle]=latitude,longitude,bearing,direction_id,current_status,carriages,occupancy_status,occupancy_percentage",
                PredictionCacheDuration);
            if (payload is null) return new List<MbtaVehicle>();

            // Vehicles report a platform stop; its parent_station is the station the app knows.
            var stops = payload.Included.ToDictionary(s => s.Id);
            return payload.Data
                .Where(v => v.Attributes.Latitude is not null && v.Attributes.Longitude is not null)
                .Select(v =>
                {
                    var stop = stops.GetValueOrDefault(v.RelatedId("stop") ?? "");
                    return new MbtaVehicle(
                        v.Id, v.RelatedId("route") ?? "", v.Attributes.DirectionId,
                        v.Attributes.Latitude!.Value, v.Attributes.Longitude!.Value,
                        v.Attributes.Bearing, v.Attributes.CurrentStatus,
                        stop?.Attributes.Name, stop?.RelatedId("parent_station") ?? stop?.Id,
                        Cars(v.Attributes));
                })
                .ToList();
        }

        // A train reports crowding per car; a bus reports it for the whole bus, which becomes its one "car".
        private static List<MbtaCar> Cars(MbtaResourceAttributesDto v) =>
            v.Carriages is { Count: > 0 } carriages ? carriages.Select(Car).ToList()
            : v.OccupancyStatus is not null ? [Car(new MbtaCarriageDto { OccupancyStatus = v.OccupancyStatus, OccupancyPercentage = v.OccupancyPercentage })]
            : [];

        // "NO_DATA_AVAILABLE" (most cars today) becomes null, so the app shows nothing rather than a guess.
        private static MbtaCar Car(MbtaCarriageDto c) =>
            c.OccupancyStatus is null or "NO_DATA_AVAILABLE" ? new MbtaCar(null, null) : new MbtaCar(c.OccupancyStatus, c.OccupancyPercentage);

        public async Task<IReadOnlyList<MbtaShape>> GetSubwayShapesAsync()
        {
            // Canonical patterns are the regular, non-diverted service. Direction 0 only: both directions share the track.
            var routeIds = string.Join(",", (await GetSubwayRoutesAsync()).Select(r => r.Id));
            var payload = await GetCachedAsync<MbtaIncludeResponseDto>(
                $"https://api-v3.mbta.com/route_patterns?filter[route]={Uri.EscapeDataString(routeIds)}" +
                "&filter[canonical]=true&filter[direction_id]=0&include=representative_trip.shape&fields[shape]=polyline",
                RouteCacheDuration);
            if (payload is null) return new List<MbtaShape>();

            var polylines = payload.Included.Where(r => r.Type == "shape").ToDictionary(s => s.Id, s => s.Attributes.Polyline);
            return payload.Included
                .Where(r => r.Type == "trip")
                .Select(t => new MbtaShape(t.RelatedId("route") ?? "", polylines.GetValueOrDefault(t.RelatedId("shape") ?? "") ?? ""))
                .Where(s => s.Polyline != "")
                .ToList();
        }

        public async Task<IReadOnlyList<MbtaShape>> GetRouteShapesAsync(string routeId)
        {
            // Typical patterns (typicality 1), both directions: buses can take different streets each way, and
            // MBTA marks only rapid transit patterns as "canonical". MBTA can't filter by typicality, so it's done here
            // (2-4 are detours and short trips); if a route somehow has no typical pattern, all of them. Variants often
            // share a shape; keep each once.
            var payload = await GetCachedAsync<MbtaIncludeResponseDto>(
                $"https://api-v3.mbta.com/route_patterns?filter[route]={Uri.EscapeDataString(routeId)}" +
                "&include=representative_trip.shape&fields[shape]=polyline",
                RouteCacheDuration);
            if (payload is null) return new List<MbtaShape>();

            var typical = payload.Data.Where(p => p.Attributes.Typicality == 1).Select(p => p.RelatedId("representative_trip")).ToHashSet();
            var polylines = payload.Included.Where(r => r.Type == "shape").ToDictionary(s => s.Id, s => s.Attributes.Polyline);
            return payload.Included
                .Where(r => r.Type == "trip" && (typical.Count == 0 || typical.Contains(r.Id)))
                .Select(t => new MbtaShape(t.RelatedId("route") ?? routeId, polylines.GetValueOrDefault(t.RelatedId("shape") ?? "") ?? ""))
                .Where(s => s.Polyline != "")
                .Distinct()
                .ToList();
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetRouteAlertsAsync(string routeIds)
        {
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                $"https://api-v3.mbta.com/alerts?filter[route]={Uri.EscapeDataString(routeIds)}&filter[datetime]=NOW", AlertCacheDuration);
            return payload?.Data ?? new List<MbtaAlertDto>();
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetUpcomingAlertsAsync(string? routeIds)
        {
            var scope = routeIds is null ? "filter[route_type]=0,1" : $"filter[route]={Uri.EscapeDataString(routeIds)}";
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                $"https://api-v3.mbta.com/alerts?{scope}&filter[lifecycle]=UPCOMING,ONGOING_UPCOMING", AlertCacheDuration);
            return payload?.Data ?? new List<MbtaAlertDto>();
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetAccessAlertsAsync(string mbtaStopId)
        {
            // Only these activities' alerts: the default (board, exit, ride) is what leaves elevators out elsewhere.
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                $"https://api-v3.mbta.com/alerts?filter[stop]={Uri.EscapeDataString(mbtaStopId)}" +
                "&filter[activity]=USING_WHEELCHAIR,USING_ESCALATOR&filter[datetime]=NOW&include=facilities", AlertCacheDuration);
            if (payload is null) return new List<MbtaAlertDto>();

            // MBTA's summary ("Alewife escalator unavailable") doesn't say which one; the facility does:
            // "Escalator 351: Main concourse to platform". (Same answer every time, so the cached copy can keep it.)
            var facilities = payload.Included.ToDictionary(f => f.Id);
            foreach (var alert in payload.Data)
            {
                var facility = alert.Attributes.InformedEntity
                    .Select(e => e.Facility is null ? null : facilities.GetValueOrDefault(e.Facility))
                    .FirstOrDefault(f => f?.Attributes.ShortName is not null);
                if (facility is not null)
                {
                    var type = facility.Attributes.Type.Replace('_', ' ').ToLowerInvariant();
                    alert.Attributes.ServiceEffect = $"{char.ToUpperInvariant(type[0])}{type[1..]} {facility.Id}: {facility.Attributes.ShortName}";
                }
            }
            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetSubwayAlertsAsync()
        {
            // MBTA's default activity filter (board, exit, ride) leaves out elevator and escalator outages.
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                "https://api-v3.mbta.com/alerts?filter[route_type]=0,1&filter[datetime]=NOW", AlertCacheDuration);
            return payload?.Data ?? new List<MbtaAlertDto>();
        }

        // The cache, keyed by URL: the first request fetches from MBTA; everyone else within `duration` gets the same
        // answer from memory. So 1,000 people watching Park Street cost MBTA one request every 10 seconds.
        // Failures are not cached: GetOrCreateAsync stores nothing when the fetch throws, so the next request retries.
        private Task<T?> GetCachedAsync<T>(string url, TimeSpan duration) =>
            _cache.GetOrCreateAsync(url, entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = duration;
                return GetAsync<T>(url);
            });

        private async Task<T?> GetAsync<T>(string url)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);

            if (!string.IsNullOrWhiteSpace(_apiKey))
            {
                request.Headers.Add("x-api-key", _apiKey);
            }

            using var response = await _httpClient.SendAsync(request);

            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<T>(JsonOptions);
        }
    }
}
