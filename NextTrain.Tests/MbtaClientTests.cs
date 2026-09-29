using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using NextTrain.Api.Services;

namespace NextTrain.Tests;

public class MbtaClientTests
{
    // Returns a canned JSON body and counts requests.
    private class StubHandler(string json) : HttpMessageHandler
    {
        public List<string> Urls { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Urls.Add(request.RequestUri!.ToString());
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            });
        }
    }

    [Fact]
    public async Task GetPredictionsAsync_ParsesSnakeCase_AndCachesByStopAndRoutes()
    {
        const string json = """
            {"data":[{"attributes":{"arrival_time":"2026-09-29T08:00:00-04:00","departure_time":null,
              "direction_id":1,"status":"Approaching"},
              "relationships":{"route":{"data":{"id":"Red","type":"route"}}}}]}
            """;
        var handler = new StubHandler(json);
        var client = new MbtaClient(new HttpClient(handler), new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()));

        var first = await client.GetPredictionsAsync("place-pktrm", "Green-B,Red");
        await client.GetPredictionsAsync("place-pktrm", "Green-B,Red"); // cached
        await client.GetPredictionsAsync("place-alfcl", "Red");         // different key

        var p = Assert.Single(first);
        Assert.Equal(DateTimeOffset.Parse("2026-09-29T12:00:00Z"), p.Attributes.ArrivalTime);
        Assert.Null(p.Attributes.DepartureTime);
        Assert.Equal(1, p.Attributes.DirectionId);
        Assert.Equal("Red", p.Relationships.Route.Data.Id);

        Assert.Equal(2, handler.Urls.Count);
        Assert.Contains("filter[stop]=place-pktrm&filter[route]=Green-B,Red", Uri.UnescapeDataString(handler.Urls[0]));
    }
}
