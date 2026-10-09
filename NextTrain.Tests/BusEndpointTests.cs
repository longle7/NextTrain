using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using NextTrain.Api.Controllers;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// The API with buses, over HTTP against the real SQL Server test database and a fake MBTA.
/// Two halves: every existing call still answers exactly as before (the 1.0 app knows nothing about buses), and the
/// new bus calls work.
/// </summary>
public class BusEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly FakeMbtaClient _mbta = new();

    public BusEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.AddRange(
                new Station { MbtaStopId = "place-sstat", Name = "South Station", Latitude = 42.352271, Longitude = -71.055242, RouteId = "Red", BusRoutes = "741:1" },
                new Station { MbtaStopId = "place-alfcl", Name = "Alewife", Latitude = 42.3958, Longitude = -71.1418, RouteId = "Red" },
                new Station { MbtaStopId = "17091", Name = "Terminal A", Latitude = 42.3657439, Longitude = -71.0174617, RouteId = "", BusRoutes = "741:1" },
                new Station { MbtaStopId = "1", Name = "Washington St opp Ruggles St", Latitude = 42.33, Longitude = -71.08, RouteId = "", BusRoutes = "1:0" });
            db.SaveChanges();
        }

        _mbta.Routes.Add(new MbtaRouteDto { Id = "Red", Attributes = new() { LongName = "Red Line", Color = "DA291C", TextColor = "FFFFFF", Type = 1 } });
        _mbta.BusRoutes.Add(new MbtaRouteDto
        {
            Id = "741",
            Attributes = new() { LongName = "Logan Airport Terminals - South Station", ShortName = "SL1", Color = "7C878E", TextColor = "FFFFFF", Type = 3,
                DirectionDestinations = ["Logan Airport Terminals", "South Station"] }
        });

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b
                .UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString)
                .UseSetting("Stations:RefreshHours", "0")
                .ConfigureTestServices(services => services.AddSingleton<IMbtaClient>(_mbta)));
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static MbtaPredictionDto Prediction(string route, int direction, int minutes) => new()
    {
        Attributes = new() { DirectionId = direction, DepartureTime = DateTimeOffset.UtcNow.AddMinutes(minutes) },
        Relationships = new() { Route = new() { Data = new() { Id = route } } }
    };

    // ---- What the 1.0 app gets: unchanged ------------------------------------------------------------------------

    [Fact]
    public async Task Stations_StillSubwayOnly()
    {
        var stations = (await _client.GetFromJsonAsync<List<Station>>("/stations"))!;

        Assert.Equal(new[] { "Alewife", "South Station" }, stations.Select(s => s.Name));
        Assert.Equal("Red", stations[1].RouteId);
    }

    [Fact]
    public async Task Routes_StillSubwayOnly_WithTheNewFieldsAdded()
    {
        var route = Assert.Single((await _client.GetFromJsonAsync<List<RouteResponse>>("/routes"))!);

        Assert.Equal(("Red", "subway"), (route.Id, route.Type));
    }

    [Fact]
    public async Task Predictions_AtAStationBusesAlsoServe_StillAskOnlyForItsSubway()
    {
        _mbta.PredictionsByStop["place-sstat"] = new() { Prediction("Red", 0, 3) };

        await _client.GetAsync("/stations/place-sstat/predictions");

        Assert.Equal("Red", Assert.Single(_mbta.PredictionRouteRequests));
    }

    [Fact]
    public async Task VehiclesAndAlerts_StillSubwayWithoutAFilter()
    {
        _mbta.Vehicles.Add(new MbtaVehicle("R-1", "Red", 0, 42.35, -71.06, 90, "STOPPED_AT", "South Station", "place-sstat", []));
        _mbta.Alerts.Add(new MbtaAlertDto { Id = "red", Attributes = new() { Effect = "DELAY", Header = "Red Line delay" } });

        Assert.Equal("R-1", Assert.Single((await _client.GetFromJsonAsync<List<MbtaVehicle>>("/vehicles"))!).Id);
        Assert.Equal("red", Assert.Single((await _client.GetFromJsonAsync<List<AlertResponse>>("/alerts"))!).Id);
    }

    // ---- Buses ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Routes_TypeBus_GivesNumbersAndColors_AndAllPutsSubwayFirst()
    {
        var bus = Assert.Single((await _client.GetFromJsonAsync<List<RouteResponse>>("/routes?type=bus"))!);
        Assert.Equal(("741", "SL1", "bus", "#7C878E"), (bus.Id, bus.ShortName, bus.Type, bus.Color));

        var all = (await _client.GetFromJsonAsync<List<RouteResponse>>("/routes?type=all"))!;
        Assert.Equal(new[] { "Red", "741" }, all.Select(r => r.Id));

        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync("/routes?type=ferry")).StatusCode);
    }

    [Fact]
    public async Task BusStops_AreTheBusOnlyStops_Compact_AndCacheable()
    {
        var response = await _client.GetAsync("/bus-stops");
        var stops = (await response.Content.ReadFromJsonAsync<List<BusStopResponse>>())!;

        Assert.Equal(new[] { "17091", "1" }, stops.Select(s => s.MbtaStopId)); // A-Z by name; South Station is in /stations
        Assert.Equal(new BusStopResponse("17091", "Terminal A", 42.36574, -71.01746, "741:1", null), stops[0]);
        Assert.Equal("public, max-age=3600", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task BusRouteStops_OneDirection_InTheOrderTheBusVisits()
    {
        _mbta.StopsByRouteDirection[("741", 1)] = new() { new() { Id = "17091" }, new() { Id = "place-sstat" } };

        var stops = (await _client.GetFromJsonAsync<List<Station>>("/stations?route=741&direction=1&sort=line"))!;

        Assert.Equal(new[] { "17091", "place-sstat" }, stops.Select(s => s.MbtaStopId));
        Assert.Empty((await _client.GetFromJsonAsync<List<Station>>("/stations?route=741&direction=0"))!);
    }

    [Fact]
    public async Task Predictions_WithBusTrue_AtABusOnlyStop_OrForABusRoute_IncludeTheBuses()
    {
        _mbta.PredictionsByStop["place-sstat"] = new() { Prediction("Red", 0, 3), Prediction("741", 1, 5) };
        _mbta.PredictionsByStop["17091"] = new() { Prediction("741", 1, 2) };

        var both = (await _client.GetFromJsonAsync<List<PredictionResponse>>("/stations/place-sstat/predictions?bus=true"))!;
        Assert.Equal(new[] { "Red", "741" }, both.Select(p => p.RouteId));
        await _client.GetAsync("/stations/17091/predictions");                                  // bus-only stop
        await _client.GetAsync("/stations/place-sstat/predictions?route=741&direction=1");     // a bus commute

        Assert.Equal(new[] { "Red,741", "741", "Red,741" }, _mbta.PredictionRouteRequests);
    }

    [Fact]
    public async Task RouteVehicles_RouteAlerts_AndRouteShapes()
    {
        _mbta.RouteVehicles["741"] = new() { new MbtaVehicle("y1234", "741", 1, 42.36, -71.03, 270, "IN_TRANSIT_TO", "Terminal A", "17091", [new MbtaCar("FEW_SEATS_AVAILABLE", null)]) };
        _mbta.RouteAlerts["1,741"] = new() { new MbtaAlertDto { Id = "detour", Attributes = new() { Effect = "DETOUR", Header = "Detour" } } };
        _mbta.RouteShapes["741"] = new() { new MbtaShape("741", "abc"), new MbtaShape("741", "def") };

        Assert.Equal("y1234", Assert.Single((await _client.GetFromJsonAsync<List<MbtaVehicle>>("/vehicles?route=741"))!).Id);
        Assert.Equal("detour", Assert.Single((await _client.GetFromJsonAsync<List<AlertResponse>>("/alerts?routes=1,741"))!).Id);
        Assert.Equal(2, (await _client.GetFromJsonAsync<List<MbtaShape>>("/routes/741/shapes"))!.Count);
    }

    [Theory]
    [InlineData("/vehicles?route=1;drop")]
    [InlineData("/alerts?routes=1,,741")]
    [InlineData("/routes/1%20OR%201/shapes")]
    [InlineData("/stations?route=1&direction=2")]
    [InlineData("/stations/place-sstat/predictions?route=a/b")]
    public async Task BadRouteInput_Returns400(string url)
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync(url)).StatusCode);
    }

    [Theory]
    [InlineData("17091", "741", 1, HttpStatusCode.Created)]      // SL1 toward South Station from Terminal A
    [InlineData("place-sstat", "741", 1, HttpStatusCode.Created)] // a bus commute from a subway station
    [InlineData("place-sstat", "Red", 0, HttpStatusCode.Created)] // the subway, as before (either direction)
    [InlineData("17091", "741", 0, HttpStatusCode.BadRequest)]    // that side of the street only goes one way
    [InlineData("17091", "1", 0, HttpStatusCode.BadRequest)]      // route 1 doesn't stop there
    public async Task BusCommutes_NeedARouteAndDirectionThatStopThere(string stop, string route, int direction, HttpStatusCode expected)
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-Id", "rider");

        var response = await client.PostAsJsonAsync("/commutes", new CommuteRequest(stop, route, direction, new TimeOnly(7, 45), new TimeOnly(8, 15)));

        Assert.Equal(expected, response.StatusCode);
    }
}
