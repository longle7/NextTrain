using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Concrete implementation of IMbtaClient using HttpClient.
    /// </summary>
    public class MbtaClient : IMbtaClient
    {
        private readonly HttpClient _httpClient;
        private readonly string? _apiKey;

        public MbtaClient(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;

            // Optional API key from configuration (e.g., "Mbta:ApiKey")
            _apiKey = configuration["Mbta:ApiKey"];
        }

        public async Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId)
        {
            var url = $"https://api-v3.mbta.com/stops?filter[route]={Uri.EscapeDataString(routeId)}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);

            if (!string.IsNullOrWhiteSpace(_apiKey))
            {
                request.Headers.Add("x-api-key", _apiKey);
            }

            using var response = await _httpClient.SendAsync(request);

            response.EnsureSuccessStatusCode();

            var payload = await response.Content.ReadFromJsonAsync<MbtaStopsResponseDto>();

            return payload?.Data ?? new List<MbtaStopDto>();
        }
    }
}