using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// GET /trips over HTTP against the real SQL Server test database, with MBTA replaced by <see cref="FakeMbtaClient"/>.
/// Every request goes without an X-User-Id: trips need none.
/// </summary>
public class TripsEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly FakeMbtaClient _mbta = new();

    // Around noon on Saturday, October 10, 2026, in Boston.
    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-10-10T12:00:00-04:00");
    private static string At(string time) => $"2026-10-10T{time}:00-04:00";

    public TripsEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.AddRange(
                new Station { MbtaStopId = "place-kencl", Name = "Kenmore", Latitude = 42.3489, Longitude = -71.0951, RouteId = "Green-B" },
                new Station { MbtaStopId = "place-hymnl", Name = "Hynes Convention Center", Latitude = 42.3479, Longitude = -71.0877, RouteId = "Green-B" },
                new Station { MbtaStopId = "place-pktrm", Name = "Park Street", Latitude = 42.3564, Longitude = -71.0624, RouteId = "Green-B,Red" },
                new Station { MbtaStopId = "place-gover", Name = "Government Center", Latitude = 42.3597, Longitude = -71.0592, RouteId = "Green-B" },
                new Station { MbtaStopId = "place-dwnxg", Name = "Downtown Crossing", Latitude = 42.3555, Longitude = -71.0602, RouteId = "Red" },
                new Station { MbtaStopId = "place-sstat", Name = "South Station", Latitude = 42.3523, Longitude = -71.0552, RouteId = "Red" },
                new Station { MbtaStopId = "43a", Name = "Tremont St @ Charles St", Latitude = 42.3520, Longitude = -71.0680, RouteId = "", BusRoutes = "43:0" },
                // About 100 m north of Park Street: close enough to walk over and change.
                new Station { MbtaStopId = "B1", Name = "Tremont St @ Park St", Latitude = 42.3573, Longitude = -71.0624, RouteId = "", BusRoutes = "43:0" });
            db.SaveChanges();
        }

        // Each route one way, in riding order, with MBTA's coordinates (what a walking change is measured with).
        _mbta.StopsByRouteDirection[("Green-B", 1)] = [Stop("place-kencl", 42.3489, -71.0951), Stop("place-hymnl", 42.3479, -71.0877), Stop("place-pktrm", 42.3564, -71.0624), Stop("place-gover", 42.3597, -71.0592)];
        _mbta.StopsByRouteDirection[("Red", 0)] = [Stop("place-pktrm", 42.3564, -71.0624), Stop("place-dwnxg", 42.3555, -71.0602), Stop("place-sstat", 42.3523, -71.0552)];
        _mbta.StopsByRouteDirection[("43", 0)] = [Stop("43a", 42.3520, -71.0680), Stop("B1", 42.3573, -71.0624)];

        _mbta.PredictionsByStop["43a"] = [FakeMbtaClient.Prediction("43", 0, At("12:03"), "bus1")];
        _mbta.PredictionsByStop["B1"] = [FakeMbtaClient.Prediction("43", 0, null, "bus1", At("12:08"))];
        _mbta.PredictionsByStop["place-kencl"] =
        [
            FakeMbtaClient.Prediction("Green-B", 1, At("12:06"), "g1"),
            FakeMbtaClient.Prediction("Green-B", 1, At("12:10"), "g2"),
            FakeMbtaClient.Prediction("Green-B", 0, At("12:05"), "g9"), // the other way
        ];
        _mbta.PredictionsByStop["place-pktrm"] =
        [
            FakeMbtaClient.Prediction("Green-B", 1, At("12:13"), "g1", At("12:12")),
            FakeMbtaClient.Prediction("Green-B", 1, At("12:17"), "g2", At("12:16")),
            FakeMbtaClient.Prediction("Red", 0, At("12:14"), "r1"),
            FakeMbtaClient.Prediction("Red", 0, At("12:17"), "r2"),
            FakeMbtaClient.Prediction("Red", 0, At("12:30"), "r3"),
            FakeMbtaClient.Prediction("Red", 1, At("12:13"), "r9"), // the other way
        ];
        _mbta.PredictionsByStop["place-gover"] =
        [
            FakeMbtaClient.Prediction("Green-B", 1, null, "g1", At("12:15")),
            FakeMbtaClient.Prediction("Green-B", 1, null, "g2", At("12:19")),
        ];
        _mbta.PredictionsByStop["place-sstat"] =
        [
            FakeMbtaClient.Prediction("Red", 0, null, "r1", At("12:18")),
            FakeMbtaClient.Prediction("Red", 0, null, "r2", At("12:21")),
            FakeMbtaClient.Prediction("Red", 0, null, "r3", At("12:34")),
        ];

        _factory = TestDb.Api(b => b.ConfigureTestServices(services =>
            services.AddSingleton<IMbtaClient>(_mbta).AddSingleton<TimeProvider>(new FixedClock(Noon))));
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static MbtaStopDto Stop(string id, double latitude, double longitude) =>
        new() { Id = id, Attributes = new() { Name = id, Latitude = latitude, Longitude = longitude } };

    private async Task<List<TripOption>> Trips(string from, string to) =>
        (await _client.GetFromJsonAsync<List<TripOption>>($"/trips?from={from}&to={to}"))!;

    private static string Clock(DateTimeOffset time) => time.ToOffset(TimeSpan.FromHours(-4)).ToString("HH:mm");

    [Fact]
    public async Task OneRide_TheFirstTrainYouCanWalkTo_WithTimeToSpare()
    {
        var json = await _client.GetStringAsync("/trips?from=place-kencl:4&to=place-gover:3");
        var trip = Assert.Single((await Trips("place-kencl:4", "place-gover:3")));

        // Leave by 12:02 for the 12:06 at Kenmore, at Government Center 12:15, then a 3-minute walk.
        Assert.Equal((Advice.NoRush, 2, "12:18", 4, 3), (trip.StartAdvice, trip.LeaveIn, Clock(trip.Arrival), trip.WalkToFirst, trip.WalkFromLast));
        Assert.Null(trip.TransferAdvice);
        var leg = Assert.Single(trip.Legs);
        Assert.Equal(("Green-B", 1, "place-kencl", "Kenmore", "place-gover", "Government Center", "12:06", "12:15"),
            (leg.RouteId, leg.DirectionId, leg.From.Id, leg.From.Name, leg.To.Id, leg.To.Name, Clock(leg.Departure), Clock(leg.Arrival)));
        Assert.Contains("\"startAdvice\":\"NoRush\"", json);
    }

    [Fact]
    public async Task NoTrip_TheWrongWay()
    {
        // Government Center comes after Kenmore going this way, and nothing is known the other way.
        Assert.Empty(await Trips("place-gover:3", "place-kencl:4"));
    }

    [Fact]
    public async Task OneChange_AtTheSameStation_WithTheTransferAdvice()
    {
        var trip = Assert.Single(await Trips("place-kencl:4", "place-sstat:2"));

        // The 12:06 reaches Park Street 12:12 and makes the 12:17 Red Line (3 minutes to change); the 12:10 would wait
        // for the 12:30, so hurry at Park Street.
        Assert.Equal(new[] { ("Green-B", "place-kencl", "place-pktrm", "12:06", "12:12"), ("Red", "place-pktrm", "place-sstat", "12:17", "12:21") },
            trip.Legs.Select(l => (l.RouteId, l.From.Id, l.To.Id, Clock(l.Departure), Clock(l.Arrival))));
        Assert.Equal("Park Street", trip.Legs[0].To.Name);
        Assert.Equal(Advice.Hurry, trip.TransferAdvice!.Advice);
        Assert.Equal("12:23", Clock(trip.Arrival));
    }

    [Fact]
    public async Task OneChange_ByWalkingToAStationWithin150Meters()
    {
        var trip = Assert.Single(await Trips("43a:2", "place-sstat:2"));

        // Off the bus at Tremont St @ Park St, a short walk to Park Street, and the first Red Line train after that.
        Assert.Equal(new[] { ("43", "43a", "B1", "12:03", "12:08"), ("Red", "place-pktrm", "place-sstat", "12:14", "12:18") },
            trip.Legs.Select(l => (l.RouteId, l.From.Id, l.To.Id, Clock(l.Departure), Clock(l.Arrival))));
        Assert.Equal(("Tremont St @ Park St", Advice.NoRush, 1), (trip.Legs[0].To.Name, trip.StartAdvice, trip.LeaveIn));
    }

    [Fact]
    public async Task Trips_EarliestArrivalFirst()
    {
        // The bus is closer and makes an earlier Red Line train than the Green Line does.
        var trips = await Trips("place-kencl:4,43a:2", "place-sstat:2");

        Assert.Equal(new[] { ("43", "12:20"), ("Green-B", "12:23") }, trips.Select(t => (t.Legs[0].RouteId, Clock(t.Arrival))));
    }

    [Fact]
    public async Task OneRide_BoardsWhereWalkingPlusRidingIsLeast()
    {
        // Hynes is a stop closer to Government Center, but a 10-minute walk; Kenmore is 2.
        var trip = Assert.Single(await Trips("place-hymnl:10,place-kencl:2", "place-gover:3"));

        Assert.Equal("place-kencl", trip.Legs[0].From.Id);
    }

    [Theory]
    [InlineData("from=a:1,b:1,c:1,d:1,e:1,f:1,g:1,h:1,i:1&to=place-gover:3")] // more than 8 stops
    [InlineData("from=place-kencl:16&to=place-gover:3")] // more than 15 minutes' walk
    [InlineData("from=place-kencl&to=place-gover:3")]    // no walk
    [InlineData("from=place kencl:4&to=place-gover:3")]  // not a stop ID
    [InlineData("from=place-kencl:4")]                   // nowhere to go
    public async Task InvalidInput_Returns400(string query)
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync($"/trips?{query}")).StatusCode);
    }
}
