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
