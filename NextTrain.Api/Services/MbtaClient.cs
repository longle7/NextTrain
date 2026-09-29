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
    /// Concrete implementation of IMbtaClient using HttpClient.
    /// </summary>
    public class MbtaClient : IMbtaClient
    {
        // Matches the web app's 10s refresh. Needs an MBTA API key under load (keyless limit is 20 requests/minute).
        public static readonly TimeSpan PredictionCacheDuration = TimeSpan.FromSeconds(10);

        // Route names and colors almost never change.
        public static readonly TimeSpan RouteCacheDuration = TimeSpan.FromHours(1);

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

            // Optional API key from configuration (e.g., "Mbta:ApiKey")
            _apiKey = configuration["Mbta:ApiKey"];
        }

        public async Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId)
        {
            // Returned in line order. Cached like routes: stations almost never change.
            var payload = await GetCachedAsync<MbtaStopsResponseDto>(
                $"https://api-v3.mbta.com/stops?filter[route]={Uri.EscapeDataString(routeId)}", RouteCacheDuration);

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

        public async Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync()
        {
            var payload = await GetCachedAsync<MbtaIncludeResponseDto>(
                "https://api-v3.mbta.com/vehicles?filter[route_type]=0,1&include=stop&fields[stop]=name" +
                "&fields[vehicle]=latitude,longitude,bearing,direction_id,current_status", PredictionCacheDuration);
            if (payload is null) return new List<MbtaVehicle>();

            var stopNames = payload.Included.ToDictionary(s => s.Id, s => s.Attributes.Name);
            return payload.Data
                .Where(v => v.Attributes.Latitude is not null && v.Attributes.Longitude is not null)
                .Select(v => new MbtaVehicle(
                    v.Id, v.RelatedId("route") ?? "", v.Attributes.DirectionId,
                    v.Attributes.Latitude!.Value, v.Attributes.Longitude!.Value,
                    v.Attributes.Bearing, v.Attributes.CurrentStatus,
                    stopNames.GetValueOrDefault(v.RelatedId("stop") ?? "")))
                .ToList();
        }

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

        // Failures are not cached: GetOrCreateAsync stores nothing when the factory throws.
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
