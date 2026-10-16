using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
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

        // The timetable doesn't change; the window moves on each minute (see ScheduleWindow).
        public static readonly TimeSpan ScheduleCacheDuration = TimeSpan.FromMinutes(1);

        private static readonly TimeZoneInfo Boston = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        // MBTA JSON uses snake_case (e.g., "arrival_time", "platform_code").
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true
        };

        private readonly HttpClient _httpClient;
        private readonly IMemoryCache _cache;

        public MbtaClient(HttpClient httpClient, IConfiguration configuration, IMemoryCache cache)
        {
            _httpClient = httpClient;
            _cache = cache;

            // Optional API key (Mbta:ApiKey in configuration), sent as a header on every request.
            var apiKey = configuration["Mbta:ApiKey"];
            if (!string.IsNullOrWhiteSpace(apiKey)) _httpClient.DefaultRequestHeaders.Add("x-api-key", apiKey);
        }

        public async Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId, int? directionId = null)
        {
            // Returned in line order. Cached like routes: stations almost never change.
            var payload = await GetCachedAsync<MbtaResponse<MbtaStopDto>>(
                $"https://api-v3.mbta.com/stops?filter[route]={Uri.EscapeDataString(routeId)}" +
                (directionId is null ? "" : $"&filter[direction_id]={directionId}"), RouteCacheDuration);

            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds)
        {
            var url = $"https://api-v3.mbta.com/predictions?filter[stop]={Uri.EscapeDataString(mbtaStopId)}" +
                      $"&filter[route]={Uri.EscapeDataString(routeIds)}";

            var payload = await GetCachedAsync<MbtaResponse<MbtaPredictionDto>>(url, PredictionCacheDuration);
            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaPredictionDto>> GetTripPredictionsAsync(string mbtaStopId, string tripIds)
        {
            var payload = await GetCachedAsync<MbtaResponse<MbtaPredictionDto>>(
                $"https://api-v3.mbta.com/predictions?filter[stop]={Uri.EscapeDataString(mbtaStopId)}&filter[trip]={Uri.EscapeDataString(tripIds)}",
                PredictionCacheDuration);
            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaScheduledDeparture>> GetSchedulesAsync(string mbtaStopId, string routeIds)
        {
            var (date, from, to) = ScheduleWindow(DateTimeOffset.UtcNow);
            var payload = await GetCachedAsync<MbtaResponse<MbtaPredictionDto>>(
                $"https://api-v3.mbta.com/schedules?filter[stop]={Uri.EscapeDataString(mbtaStopId)}" +
                $"&filter[route]={Uri.EscapeDataString(routeIds)}&filter[date]={date}&filter[min_time]={from}&filter[max_time]={to}" +
                "&sort=departure_time&fields[schedule]=departure_time,direction_id,pickup_type", ScheduleCacheDuration);
            return payload.Data
                .Where(s => s.Attributes.DepartureTime is not null && s.Attributes.PickupType != 1)
                .Select(s => new MbtaScheduledDeparture(s.Relationships.Route.Data.Id, s.Attributes.DirectionId, s.Attributes.DepartureTime!.Value))
                .ToList();
        }

        /// <summary>
        /// The next three hours of MBTA's timetable, in its terms: a service date and times on it. A service day runs
        /// from about 3 AM to the last trips after midnight, which MBTA writes past 24:00 (1:30 AM is "25:30" on the day
        /// before).
        /// </summary>
        public static (string Date, string From, string To) ScheduleWindow(DateTimeOffset now)
        {
            var local = TimeZoneInfo.ConvertTime(now, Boston);
            var afterMidnight = local.Hour < 3;
            var minutes = (afterMidnight ? 24 * 60 : 0) + local.Hour * 60 + local.Minute;
            static string Time(int m) => $"{m / 60:00}:{m % 60:00}";
            return ((afterMidnight ? local.AddDays(-1) : local).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), Time(minutes), Time(minutes + 180));
        }

        public Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync() => GetRoutesAsync("0,1");

        public Task<IReadOnlyList<MbtaRouteDto>> GetBusRoutesAsync() => GetRoutesAsync("3");

        private async Task<IReadOnlyList<MbtaRouteDto>> GetRoutesAsync(string types) =>
            (await GetCachedAsync<MbtaResponse<MbtaRouteDto>>($"https://api-v3.mbta.com/routes?filter[type]={types}", RouteCacheDuration))
                .Data.OrderBy(r => r.Attributes.SortOrder).ToList();

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
            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetUpcomingAlertsAsync(string? routeIds)
        {
            var scope = routeIds is null ? "filter[route_type]=0,1" : $"filter[route]={Uri.EscapeDataString(routeIds)}";
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                $"https://api-v3.mbta.com/alerts?{scope}&filter[lifecycle]=UPCOMING,ONGOING_UPCOMING", AlertCacheDuration);
            return payload.Data;
        }

        public async Task<IReadOnlyList<MbtaAlertDto>> GetAccessAlertsAsync(string mbtaStopId)
        {
            // Only these activities' alerts: the default (board, exit, ride) is what leaves elevators out elsewhere.
            var payload = await GetCachedAsync<MbtaAlertsResponseDto>(
                $"https://api-v3.mbta.com/alerts?filter[stop]={Uri.EscapeDataString(mbtaStopId)}" +
                "&filter[activity]=USING_WHEELCHAIR,USING_ESCALATOR&filter[datetime]=NOW&include=facilities", AlertCacheDuration);

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
            return payload.Data;
        }

        // The cache, keyed by URL: the first request fetches from MBTA; everyone else within `duration` gets the same
        // answer from memory. So 1,000 people watching Park Street cost MBTA one request every 10 seconds.
        // Failures are not cached: GetOrCreateAsync stores nothing when the fetch throws (GetFromJsonAsync throws on
        // a non-success status), so the next request retries.
        private async Task<T> GetCachedAsync<T>(string url, TimeSpan duration) where T : new() =>
            await _cache.GetOrCreateAsync(url, async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = duration;
                return await _httpClient.GetFromJsonAsync<T>(url, JsonOptions) ?? new T();
            }) ?? new T();
    }
}
