using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using NextTrain.Api.Controllers;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// Commutes that change lines partway, and GET /connections, over HTTP against the real SQL Server test database
/// with MBTA replaced by <see cref="FakeMbtaClient"/>.
/// </summary>
public class TransferEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeMbtaClient _mbta = new();

    public TransferEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.AddRange(
                new Station { MbtaStopId = "place-kencl", Name = "Kenmore", Latitude = 42.3489, Longitude = -71.0951, RouteId = "Green-B" },
                new Station { MbtaStopId = "place-pktrm", Name = "Park Street", Latitude = 42.3564, Longitude = -71.0624, RouteId = "Green-B,Red" },
                new Station { MbtaStopId = "place-gover", Name = "Government Center", Latitude = 42.3597, Longitude = -71.0592, RouteId = "Blue,Green-B" },
                // A walking change, from MBTA's real stops: off the 66 at Tremont St @ Columbus Ave, about 80 m to the 22
                // at Columbus Ave @ Malcolm X Blvd. Columbus Ave @ Cedar St is the 22 too, but about 410 m away.
                new Station { MbtaStopId = "1308", Name = "Harvard St @ Beacon St", Latitude = 42.342499, Longitude = -71.121845, RouteId = "", BusRoutes = "66:1" },
                new Station { MbtaStopId = "1323", Name = "Tremont St @ Columbus Ave", Latitude = 42.331479, Longitude = -71.095333, RouteId = "", BusRoutes = "66:1" },
                new Station { MbtaStopId = "1222", Name = "Columbus Ave @ Malcolm X Blvd", Latitude = 42.331191, Longitude = -71.094468, RouteId = "", BusRoutes = "22:1" },
                new Station { MbtaStopId = "1221", Name = "Columbus Ave @ Cedar St", Latitude = 42.328012, Longitude = -71.096921, RouteId = "", BusRoutes = "22:1" });
            db.SaveChanges();
        }
        // The B branch eastbound, and the 66 toward Nubian, in riding order.
        _mbta.StopsByRouteDirection[("Green-B", 1)] = new()
        {
            new MbtaStopDto { Id = "place-kencl" }, new MbtaStopDto { Id = "place-pktrm" }, new MbtaStopDto { Id = "place-gover" },
        };
        _mbta.StopsByRouteDirection[("66", 1)] = new() { new MbtaStopDto { Id = "1308" }, new MbtaStopDto { Id = "1323" } };

        _factory = TestDb.Api(b => b.ConfigureTestServices(services =>
            services.AddSingleton<IMbtaClient>(_mbta).AddSingleton<TimeProvider>(new FixedClock(Noon))));
    }

    // The predictions below are around noon on Saturday, October 10, 2026, in Boston.
    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-10-10T12:00:00-04:00");

    public void Dispose() => _factory.Dispose();

    private HttpClient Client()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-Id", "alice");
        return client;
    }

    // Kenmore, Green Line B eastbound, changing at `via` onto `toRoute` one way.
    private static CommuteRequest Transfer(string via = "place-gover", string toRoute = "Blue", int? toDirection = 1, int? minutes = null, string from = "place-kencl") =>
        new(from, "Green-B", 1, new TimeOnly(7, 45), new TimeOnly(8, 15), "Mon,Tue,Wed,Thu,Fri", via, toRoute, toDirection, minutes);

    [Fact]
    public async Task ACommuteWithATransfer_RoundTrips_WithThreeMinutesByDefault()
    {
        using var client = Client();

        var created = await client.PostAsJsonAsync("/commutes", Transfer());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var commute = (await client.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!.Single();

        Assert.Equal(("place-gover", "Government Center", "Blue", 1, 3),
            (commute.TransferStopId, commute.TransferStationName, commute.TransferRouteId, commute.TransferDirectionId, commute.TransferMinutes));

        // Editing it without a transfer makes it one ride again.
        var oneRide = Transfer() with { TransferStopId = null, TransferRouteId = null, TransferDirectionId = null };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/commutes/{commute.Id}", oneRide)).StatusCode);
        var json = await client.GetStringAsync($"/commutes/{commute.Id}");
        Assert.DoesNotContain("transfer", json, StringComparison.OrdinalIgnoreCase); // reads exactly as a commute always has
    }

    [Theory]
    [InlineData("place-kencl", "Blue", 1, null, "place-pktrm")]   // the transfer is before where you board
    [InlineData("place-gover", "Red", 1, null, "place-kencl")]    // the Red Line doesn't stop there
    [InlineData("place-gover", "Green-B", 1, null, "place-kencl")] // the same route isn't a transfer
    [InlineData("place-nowhere", "Blue", 1, null, "place-kencl")] // unknown station
    [InlineData("place-gover", "Blue", null, null, "place-kencl")] // half a transfer
    [InlineData("place-gover", "Blue", 1, 11, "place-kencl")]      // more than 10 minutes to change
    public async Task AnInvalidTransfer_Returns400(string via, string toRoute, int? toDirection, int? minutes, string from)
    {
        using var client = Client();

        var response = await client.PostAsJsonAsync("/commutes", Transfer(via, toRoute, toDirection, minutes, from));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // The 66 from Harvard St @ Beacon St, getting off at `off` and walking to `via` for the 22.
    private static CommuteRequest WalkingChange(string off = "1323", string via = "1222") =>
        new("1308", "66", 1, new TimeOnly(7, 45), new TimeOnly(8, 15), "Mon,Tue,Wed,Thu,Fri", via, "22", 1, 3, off);

    [Fact]
    public async Task AWalkingChange_RoundTrips_WithWhereYouGetOff()
    {
        using var client = Client();

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/commutes", WalkingChange())).StatusCode);
        var commute = (await client.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!.Single();

        Assert.Equal(("1323", "Tremont St @ Columbus Ave", "1222", "Columbus Ave @ Malcolm X Blvd", "22"),
            (commute.TransferFromStopId, commute.TransferFromStationName, commute.TransferStopId, commute.TransferStationName, commute.TransferRouteId));

        // Changing where you get off is the same as no walk: nothing extra is stored or sent.
        var sameStop = Transfer() with { TransferFromStopId = "place-gover" };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/commutes/{commute.Id}", sameStop)).StatusCode);
        Assert.DoesNotContain("transferFrom", await client.GetStringAsync($"/commutes/{commute.Id}"));
    }

    [Theory]
    [InlineData("1323", "1221")]  // more than a 5-minute walk apart
    [InlineData("1308", "1222")]  // getting off where you board
    [InlineData("nowhere", "1222")] // unknown stop
    public async Task AnInvalidWalkingChange_Returns400(string off, string via)
    {
        using var client = Client();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/commutes", WalkingChange(off, via))).StatusCode);
    }

    [Fact]
    public async Task Connections_WithOff_TimeTheFirstRideWhereYouGetOff_ThenTheWalk()
    {
        _mbta.PredictionsByStop["1308"] = new()
        {
            FakeMbtaClient.Prediction("66", 1, "2026-10-10T12:02:00-04:00", "a"),
            FakeMbtaClient.Prediction("66", 1, "2026-10-10T12:14:00-04:00", "b"),
        };
        _mbta.PredictionsByStop["1323"] = new()
        {
            FakeMbtaClient.Prediction("66", 1, null, "a", "2026-10-10T12:20:00-04:00"),
            FakeMbtaClient.Prediction("66", 1, null, "b", "2026-10-10T12:32:00-04:00"),
        };
        _mbta.PredictionsByStop["1222"] = new()
        {
            FakeMbtaClient.Prediction("22", 1, "2026-10-10T12:24:00-04:00", "c"),
            FakeMbtaClient.Prediction("22", 1, "2026-10-10T12:50:00-04:00", "d"),
        };
        using var client = _factory.CreateClient();
        const string ride = "/connections?from=1308&route=66&direction=1&via=1222&toRoute=22&toDirection=1&minutes=3";

        var plan = (await client.GetFromJsonAsync<ConnectionPlan>(ride + "&off=1323"))!;
        var withoutOff = (await client.GetFromJsonAsync<ConnectionPlan>(ride))!;

        // Off at 12:20, three minutes' walk, the 12:24 22. Miss this bus and the next makes only the 12:50: hurry.
        Assert.Equal(Advice.Hurry, plan.Advice);
        Assert.Equal(new[] { "12:24", "12:50" }, plan.Trains.Select(t => t.Connection!.Value.ToOffset(TimeSpan.FromHours(-4)).ToString("HH:mm")));
        Assert.Equal(Advice.Unknown, withoutOff.Advice); // the 66 doesn't stop at the 22's stop: no times without `off`
    }

    [Fact]
    public async Task Connections_NoRush_WhenThisTrainAndTheNextMakeTheSameBlueLineTrain()
    {
        _mbta.PredictionsByStop["place-pktrm"] = new()
        {
            FakeMbtaClient.Prediction("Green-B", 1, "2026-10-10T12:02:00-04:00", "g1"),
            FakeMbtaClient.Prediction("Green-B", 1, "2026-10-10T12:05:00-04:00", "g2"),
            FakeMbtaClient.Prediction("Green-B", 0, "2026-10-10T12:01:00-04:00", "g9"), // the other way
        };
        _mbta.PredictionsByStop["place-gover"] = new()
        {
            FakeMbtaClient.Prediction("Green-B", 1, null, "g1", "2026-10-10T12:04:00-04:00"), // ends here: an arrival, no departure
            FakeMbtaClient.Prediction("Green-B", 1, null, "g2", "2026-10-10T12:07:00-04:00"),
            FakeMbtaClient.Prediction("Blue", 1, "2026-10-10T12:06:00-04:00", "b1"), // too soon for either
            FakeMbtaClient.Prediction("Blue", 1, "2026-10-10T12:12:00-04:00", "b2"),
            FakeMbtaClient.Prediction("Blue", 0, "2026-10-10T12:08:00-04:00", "b3"), // the other way
        };
        using var client = _factory.CreateClient();

        var plan = (await client.GetFromJsonAsync<ConnectionPlan>(
            "/connections?from=place-pktrm&route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1&minutes=3"))!;
        var json = await client.GetStringAsync("/connections?from=place-pktrm&route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1");

        Assert.Equal(Advice.NoRush, plan.Advice);
        Assert.Equal(new[] { "12:12", "12:12" }, plan.Trains.Select(t => t.Connection!.Value.ToOffset(TimeSpan.FromHours(-4)).ToString("HH:mm")));
        Assert.Contains("\"advice\":\"NoRush\"", json);
    }

    [Fact]
    public async Task Connections_SkipTrainsThatAlreadyLeft()
    {
        _mbta.PredictionsByStop["place-pktrm"] = new()
        {
            FakeMbtaClient.Prediction("Green-B", 1, "2026-10-10T11:56:00-04:00", "g0"), // left 4 minutes ago; MBTA still lists it
            FakeMbtaClient.Prediction("Green-B", 1, "2026-10-10T12:02:00-04:00", "g1"),
        };
        _mbta.PredictionsByStop["place-gover"] = new()
        {
            FakeMbtaClient.Prediction("Green-B", 1, null, "g0", "2026-10-10T11:58:00-04:00"),
            FakeMbtaClient.Prediction("Green-B", 1, null, "g1", "2026-10-10T12:04:00-04:00"),
            FakeMbtaClient.Prediction("Blue", 1, "2026-10-10T11:59:00-04:00", "b0"), // also gone
            FakeMbtaClient.Prediction("Blue", 1, "2026-10-10T12:10:00-04:00", "b1"),
        };
        using var client = _factory.CreateClient();

        var plan = (await client.GetFromJsonAsync<ConnectionPlan>(
            "/connections?from=place-pktrm&route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1"))!;

        var train = Assert.Single(plan.Trains);
        Assert.Equal(DateTimeOffset.Parse("2026-10-10T12:02:00-04:00"), train.Departure);
        Assert.Equal(DateTimeOffset.Parse("2026-10-10T12:10:00-04:00"), train.Connection);
    }

    [Theory]
    [InlineData("from=place-pktrm&route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1&minutes=0")]
    [InlineData("from=place-pktrm&route=Green-B&direction=2&via=place-gover&toRoute=Blue&toDirection=1")]
    [InlineData("from=place pktrm&route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1")]
    [InlineData("route=Green-B&direction=1&via=place-gover&toRoute=Blue&toDirection=1")]
    public async Task Connections_InvalidInput_Returns400(string query)
    {
        using var client = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/connections?{query}")).StatusCode);
    }
}
