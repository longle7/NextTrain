using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using NextTrain.Api.Controllers;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// Calls the /stations endpoints over HTTP against the real SQL Server test database,
/// with MBTA replaced by <see cref="FakeMbtaClient"/>.
/// </summary>
public class StationsEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly FakeMbtaClient _mbta = new();

    public StationsEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.AddRange(
                new Station { MbtaStopId = "place-pktrm", Name = "Park Street", Latitude = 42.3564, Longitude = -71.0624, RouteId = "Green-B,Red", AverageWeekdayBoardings = 41069 },
                new Station { MbtaStopId = "place-gover", Name = "Government Center", Latitude = 42.3597, Longitude = -71.0592, RouteId = "Blue,Green-B", AverageWeekdayBoardings = 29846 },
                new Station { MbtaStopId = "place-alfcl", Name = "Alewife", Latitude = 42.3958, Longitude = -71.1418, RouteId = "Red" });
            db.SaveChanges();
        }

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

    [Fact]
    public async Task GetAll_FiltersByRoute_SortedByName()
    {
        var stations = await _client.GetFromJsonAsync<List<Station>>("/stations?route=Red");

        Assert.Equal(new[] { "Alewife", "Park Street" }, stations!.Select(s => s.Name));
    }

    [Theory]
    [InlineData("/stations/place-pktrm/predictions?direction=2")]
    [InlineData("/stations?sort=line")] // line order needs a route
    [InlineData("/stations?sort=bogus")]
    public async Task InvalidInput_Returns400(string url)
    {
        var response = await _client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/stations/place-unknown")]
    [InlineData("/stations/place-unknown/predictions")]
    public async Task UnknownStation_Returns404(string url)
    {
        var response = await _client.GetAsync(url);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_ReturnsStation()
    {
        var station = await _client.GetFromJsonAsync<Station>("/stations/place-alfcl");

        Assert.Equal("Alewife", station!.Name);
    }

    private static MbtaPredictionDto Prediction(string route, int direction, string? departure) => new()
    {
        Attributes = new MbtaPredictionAttributesDto
        {
            DirectionId = direction,
            DepartureTime = departure is null ? null : DateTimeOffset.Parse(departure),
        },
        Relationships = new MbtaPredictionRelationshipsDto { Route = new() { Data = new() { Id = route } } }
    };

    [Fact]
    public async Task GetPredictions_FiltersByRouteAndDirection_SortedSoonestFirst()
    {
        _mbta.PredictionsByStop["place-pktrm"] = new()
        {
            Prediction("Red", 0, "2026-09-29T08:05:00-04:00"),
            Prediction("Green-B", 1, null), // ends here: nothing to board, dropped
            Prediction("Red", 1, "2026-09-29T08:03:00-04:00"),
            Prediction("Red", 0, null), // skipped stop, dropped
        };

        var red = await _client.GetFromJsonAsync<List<PredictionResponse>>("/stations/place-pktrm/predictions?route=Red");
        var redInbound = await _client.GetFromJsonAsync<List<PredictionResponse>>("/stations/place-pktrm/predictions?route=Red&direction=0");

        Assert.Equal(new[] { 1, 0 }, red!.Select(p => p.DirectionId));
        Assert.Equal(DateTimeOffset.Parse("2026-09-29T08:05:00-04:00"), Assert.Single(redInbound!).DepartureTime);
    }

    [Fact]
    public async Task GetPredictions_MbtaDown_Returns503()
    {
        _mbta.PredictionsError = new HttpRequestException("MBTA is down");

        var response = await _client.GetAsync("/stations/place-pktrm/predictions");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task ImportStations_Development_PostOnly()
    {
        _mbta.StopsByRoute["Orange"] = new()
        {
            new MbtaStopDto { Id = "place-dwnxg", Attributes = new() { Name = "Downtown Crossing", Latitude = 42.3555, Longitude = -71.0605 } }
        };

        var get = await _client.GetAsync("/admin/import-stations");
        var post = await _client.PostAsync("/admin/import-stations", null);

        Assert.Equal(HttpStatusCode.MethodNotAllowed, get.StatusCode);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync("/stations/place-dwnxg")).StatusCode);
    }

    [Fact]
    public async Task ImportStations_Production_NotMapped()
    {
        using var prodClient = _factory.WithWebHostBuilder(b => b.UseEnvironment("Production")).CreateClient();

        var post = await prodClient.PostAsync("/admin/import-stations", null);

        Assert.Equal(HttpStatusCode.NotFound, post.StatusCode);
    }

    [Fact]
    public async Task GetRoutes_ReturnsDisplayInfo_WithHashColors()
    {
        _mbta.Routes.Add(new MbtaRouteDto
        {
            Id = "Red",
            Attributes = new()
            {
                LongName = "Red Line", Color = "DA291C", TextColor = "FFFFFF",
                DirectionNames = new() { "South", "North" }, DirectionDestinations = new() { "Ashmont/Braintree", "Alewife" }
            }
        });

        var route = Assert.Single((await _client.GetFromJsonAsync<List<RouteResponse>>("/routes"))!);

        Assert.Equal("#DA291C", route.Color);
        Assert.Equal("Alewife", route.DirectionDestinations[1]);
    }

    [Fact]
    public async Task GetAll_SortByLine_FollowsMbtaOrder()
    {
        // MBTA order along the line, deliberately not alphabetical.
        _mbta.StopsByRoute["Red"] = new() { new() { Id = "place-pktrm" }, new() { Id = "place-alfcl" } };

        var stations = await _client.GetFromJsonAsync<List<Station>>("/stations?route=Red&sort=line");

        Assert.Equal(new[] { "Park Street", "Alewife" }, stations!.Select(s => s.Name));
    }

    [Fact]
    public async Task GetAll_SortByRidership_BusiestFirst_UnknownLast()
    {
        var stations = await _client.GetFromJsonAsync<List<Station>>("/stations?sort=ridership");

        Assert.Equal(new[] { "Park Street", "Government Center", "Alewife" }, stations!.Select(s => s.Name));
    }

    [Fact]
    public async Task GetVehicles_ReturnsLivePositions()
    {
        _mbta.Vehicles.Add(new MbtaVehicle("R-1", "Red", 1, 42.3, -71.06, 85, "STOPPED_AT", "Savin Hill", "place-shmnl",
            [new MbtaCar("MANY_SEATS_AVAILABLE", 12), new MbtaCar(null, null)]));

        var vehicle = Assert.Single((await _client.GetFromJsonAsync<List<MbtaVehicle>>("/vehicles"))!);

        Assert.Equal("Savin Hill", vehicle.StopName);
        Assert.Equal("place-shmnl", vehicle.StationId);
        Assert.Equal(85, vehicle.Bearing);
        Assert.Equal(new[] { new MbtaCar("MANY_SEATS_AVAILABLE", 12), new MbtaCar(null, null) }, vehicle.Cars);
    }

    [Fact]
    public async Task UnexpectedError_InProduction_Returns500ProblemJson_WithoutInternals()
    {
        _mbta.VehiclesError = new InvalidOperationException("secret internal detail");
        using var prodClient = _factory.WithWebHostBuilder(b => b.UseEnvironment("Production")).CreateClient();

        var response = await prodClient.GetAsync("/vehicles");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("secret internal detail", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetVehicles_MbtaDown_Returns503()
    {
        _mbta.VehiclesError = new HttpRequestException("MBTA down");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await _client.GetAsync("/vehicles")).StatusCode);
    }

    [Fact]
    public async Task GetAlerts_MostSevereFirst_WithShortSummary_AndDistinctEntities()
    {
        MbtaAlertDto Alert(string id, int severity, string? serviceEffect, params MbtaInformedEntityDto[] entities) => new()
        {
            Id = id,
            Attributes = new()
            {
                Effect = "DELAY", Severity = severity, Header = $"Header {id}", ServiceEffect = serviceEffect,
                InformedEntity = entities.ToList()
            }
        };
        var redLine = new MbtaInformedEntityDto { Route = "Red" };
        _mbta.Alerts.Add(Alert("minor", 1, "Station issue at Savin Hill", redLine));
        _mbta.Alerts.Add(Alert("major", 7, null, redLine, new MbtaInformedEntityDto { Route = "Red" })); // repeated per activity

        var alerts = (await _client.GetFromJsonAsync<List<AlertResponse>>("/alerts"))!;

        Assert.Equal(new[] { "major", "minor" }, alerts.Select(a => a.Id));
        Assert.Equal("Header major", alerts[0].Summary); // no service_effect: falls back to the header
        Assert.Equal(new AlertEntity("Red", null, null), Assert.Single(alerts[0].Entities));
    }

    private static MbtaAlertDto Alert(string id, string effect, params MbtaActivePeriodDto[] periods) => new()
    {
        Id = id,
        Attributes = new()
        {
            Effect = effect, Severity = 5, Header = $"Header {id}",
            InformedEntity = [new MbtaInformedEntityDto { Route = "Red" }], ActivePeriod = periods.ToList()
        }
    };

    [Fact]
    public async Task GetUpcoming_NextPeriodWithinTwoWeeks_SoonestFirst()
    {
        var now = DateTimeOffset.UtcNow;
        MbtaActivePeriodDto Days(double from, double? to) => new() { Start = now.AddDays(from), End = to is null ? null : now.AddDays(to.Value) };
        _mbta.UpcomingAlerts[""] = new()
        {
            Alert("later", "SHUTTLE", Days(9, 11)),
            Alert("weekends", "SUSPENSION", Days(-1, 0.5), Days(6, 8), Days(13, 15)), // on now, and again in 6 days
            Alert("too-far", "SHUTTLE", Days(20, 22)),
            Alert("open-ended", "STATION_CLOSURE", Days(2, null)),
        };

        var upcoming = (await _client.GetFromJsonAsync<List<AlertResponse>>("/alerts/upcoming"))!;

        Assert.Equal(new[] { "open-ended", "weekends", "later" }, upcoming.Select(a => a.Id));
        Assert.Equal(now.AddDays(6), upcoming[1].Start!.Value, TimeSpan.FromSeconds(1)); // the next weekend, not the current one
        Assert.Null(upcoming[0].End);
    }

    [Fact]
    public async Task GetAlerts_LeavesOutStartAndEnd_SoOlderAppsSeeTheSameAnswer()
    {
        _mbta.Alerts.Add(Alert("now", "DELAY", new MbtaActivePeriodDto { Start = DateTimeOffset.UtcNow.AddHours(-1) }));

        var json = await _client.GetStringAsync("/alerts");

        Assert.DoesNotContain("\"start\"", json);
        Assert.DoesNotContain("\"end\"", json);
    }

    [Fact]
    public async Task GetAccess_ElevatorAndEscalatorOutagesOnly_ElevatorsFirst()
    {
        _mbta.AccessAlerts["place-pktrm"] = new()
        {
            Alert("escalator", "ESCALATOR_CLOSURE"),
            Alert("elevator", "ELEVATOR_CLOSURE"),
            Alert("closure", "STATION_CLOSURE"), // a whole-station alert: already on the station's alerts
        };

        var access = (await _client.GetFromJsonAsync<List<AlertResponse>>("/stations/place-pktrm/access"))!;

        Assert.Equal(new[] { "elevator", "escalator" }, access.Select(a => a.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/stations/place-nowhere/access")).StatusCode);
    }

    [Fact]
    public async Task GetAlerts_MbtaDown_Returns503()
    {
        _mbta.AlertsError = new HttpRequestException("MBTA down");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await _client.GetAsync("/alerts")).StatusCode);
    }

    [Fact]
    public async Task GetRouteShapes_ReturnsPolylines()
    {
        _mbta.Shapes.Add(new MbtaShape("Red", "_p~iF~ps|U"));

        var shape = Assert.Single((await _client.GetFromJsonAsync<List<MbtaShape>>("/routes/shapes"))!);

        Assert.Equal("Red", shape.RouteId);
    }
}
