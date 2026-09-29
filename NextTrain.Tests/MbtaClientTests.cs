using System.Net;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

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

    [Fact]
    public async Task GetSubwayRoutesAsync_ParsesSnakeCase_SortedBySortOrder()
    {
        const string json = """
            {"data":[
              {"id":"Blue","attributes":{"long_name":"Blue Line","color":"003DA5","text_color":"FFFFFF","sort_order":10040,
                "direction_names":["West","East"],"direction_destinations":["Bowdoin","Wonderland"]}},
              {"id":"Red","attributes":{"long_name":"Red Line","color":"DA291C","text_color":"FFFFFF","sort_order":10010,
                "direction_names":["South","North"],"direction_destinations":["Ashmont/Braintree","Alewife"]}}]}
            """;
        var client = new MbtaClient(new HttpClient(new StubHandler(json)), new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()));

        var routes = await client.GetSubwayRoutesAsync();

        Assert.Equal(new[] { "Red", "Blue" }, routes.Select(r => r.Id));
        Assert.Equal("Red Line", routes[0].Attributes.LongName);
        Assert.Equal(new[] { "Ashmont/Braintree", "Alewife" }, routes[0].Attributes.DirectionDestinations);
    }

    [Fact]
    public async Task GetSubwayVehiclesAsync_JoinsStopNames_SkipsTrainsWithoutLocation()
    {
        const string json = """
            {"data":[
              {"id":"R-1","attributes":{"latitude":42.3,"longitude":-71.06,"bearing":85,"direction_id":1,"current_status":"IN_TRANSIT_TO"},
               "relationships":{"route":{"data":{"id":"Red"}},"stop":{"data":{"id":"70088"}}}},
              {"id":"R-2","attributes":{"latitude":42.4,"longitude":-71.1,"bearing":null,"direction_id":0,"current_status":"STOPPED_AT"},
               "relationships":{"route":{"data":{"id":"Red"}},"stop":{"data":null}}},
              {"id":"R-3","attributes":{"latitude":null,"longitude":null,"direction_id":0},
               "relationships":{"route":{"data":{"id":"Red"}}}}],
             "included":[{"id":"70088","type":"stop","attributes":{"name":"Savin Hill"},
               "relationships":{"parent_station":{"data":{"id":"place-shmnl","type":"stop"}}}}]}
            """;
        var client = new MbtaClient(new HttpClient(new StubHandler(json)), new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()));

        var vehicles = await client.GetSubwayVehiclesAsync();

        Assert.Equal(new[] { "R-1", "R-2" }, vehicles.Select(v => v.Id));
        Assert.Equal(new MbtaVehicle("R-1", "Red", 1, 42.3, -71.06, 85, "IN_TRANSIT_TO", "Savin Hill", "place-shmnl"), vehicles[0]);
        Assert.Null(vehicles[1].StopName);
        Assert.Null(vehicles[1].StationId);
        Assert.Null(vehicles[1].Bearing);
    }

    [Fact]
    public async Task GetSubwayAlertsAsync_ParsesSnakeCase_ForSubwayAlertsInEffectNow()
    {
        const string json = """
            {"data":[{"id":"1033333","attributes":{"effect":"SUSPENSION","severity":7,
              "header":"Green Line: No trains between North Station & Kenmore.","description":"Use shuttle buses.",
              "service_effect":"Suspension of service on Green Line","timeframe":"through Sunday","url":null,
              "informed_entity":[{"route":"Green-B","stop":"place-pktrm","direction_id":null,"activities":["BOARD"]}]}}]}
            """;
        var handler = new StubHandler(json);
        var client = new MbtaClient(new HttpClient(handler), new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()));

        var alert = Assert.Single(await client.GetSubwayAlertsAsync());

        Assert.Equal("SUSPENSION", alert.Attributes.Effect);
        Assert.Equal(7, alert.Attributes.Severity);
        Assert.Equal("Suspension of service on Green Line", alert.Attributes.ServiceEffect);
        Assert.Equal("through Sunday", alert.Attributes.Timeframe);
        var entity = Assert.Single(alert.Attributes.InformedEntity);
        Assert.Equal(("Green-B", "place-pktrm", (int?)null), (entity.Route, entity.Stop, entity.DirectionId));
        Assert.Contains("filter[route_type]=0,1&filter[datetime]=NOW", Uri.UnescapeDataString(handler.Urls[0]));
    }

    [Fact]
    public async Task GetSubwayShapesAsync_JoinsTripsToShapes_ForAllSubwayRoutes()
    {
        // Served for both the /routes and /route_patterns calls: each parse reads only the fields it needs.
        const string json = """
            {"data":[{"id":"Red","attributes":{"sort_order":1}}],
             "included":[
               {"id":"canonical-Red-C1-0","type":"trip","relationships":{"route":{"data":{"id":"Red"}},"shape":{"data":{"id":"s1"}}}},
               {"id":"s1","type":"shape","attributes":{"polyline":"_p~iF~ps|U"}}]}
            """;
        var handler = new StubHandler(json);
        var client = new MbtaClient(new HttpClient(handler), new ConfigurationBuilder().Build(),
            new MemoryCache(new MemoryCacheOptions()));

        var shape = Assert.Single(await client.GetSubwayShapesAsync());

        Assert.Equal(new MbtaShape("Red", "_p~iF~ps|U"), shape);
        Assert.Contains("filter[route]=Red&filter[canonical]=true", Uri.UnescapeDataString(handler.Urls[1]));
    }
}
