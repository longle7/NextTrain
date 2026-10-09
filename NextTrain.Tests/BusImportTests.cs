using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// Importing bus stops: one row per stop with its routes and directions, subway stations untouched apart from
/// their buses (older app versions read their RouteId), and stops MBTA drops cleaned up safely.
/// Against the real SQL Server test database, with a fake MBTA client.
/// </summary>
public class BusImportTests
{
    private static MbtaStopDto Stop(string id, string name, double lat = 42.35, double lon = -71.06) =>
        new() { Id = id, Attributes = new MbtaStopAttributesDto { Name = name, Latitude = lat, Longitude = lon } };

    private static MbtaRouteDto Route(string id) => new() { Id = id, Attributes = new() { Type = 3 } };

    // Red Line through South Station; SL1 ("741") ends there; route 1 runs Nubian -> Mass Ave (and back on the
    // other side of the street); route 10 shares no stops with route 1.
    private static FakeMbtaClient Mbta()
    {
        var mbta = new FakeMbtaClient();
        mbta.StopsByRoute["Red"] = new() { Stop("place-sstat", "South Station"), Stop("place-alfcl", "Alewife") };
        mbta.BusRoutes.AddRange(new[] { Route("741"), Route("1"), Route("10") });
        mbta.StopsByRouteDirection[("741", 1)] = new() { Stop("17091", "Terminal A"), Stop("place-sstat", "South Station") };
        mbta.StopsByRouteDirection[("1", 0)] = new() { Stop("place-nubn", "Nubian"), Stop("1", "Washington St opp Ruggles St") };
        mbta.StopsByRouteDirection[("1", 1)] = new() { Stop("63", "Washington St @ Ruggles St"), Stop("place-nubn", "Nubian") };
        mbta.StopsByRouteDirection[("10", 0)] = new() { Stop("1000", "Andrew Square") };
        return mbta;
    }

    [Fact]
    public void MergeBusStops_OneRowPerStop_WithSortedRouteDirections_AndNoSubwayRoute()
    {
        var nubian = Stop("place-nubn", "Nubian");

        var stops = StationImportService.MergeBusStops(new[] { ("1", 1, nubian), ("1", 0, nubian), ("SL4", 0, nubian), ("1", 0, nubian) });

        var stop = Assert.Single(stops);
        Assert.Equal("", stop.RouteId);
        Assert.Equal("1:0,1:1,SL4:0", stop.BusRoutes);
    }

    [Fact]
    public async Task Import_AddsBusStops_GivesSubwayStationsTheirBuses_AndKeepsSubwayRoutesSubwayOnly()
    {
        using var db = TestDb.CreateClean();

        await new StationImportService(Mbta(), db).ImportStationsAsync();

        var southStation = await db.Stations.SingleAsync(s => s.MbtaStopId == "place-sstat");
        Assert.Equal("Red", southStation.RouteId);     // what older app versions read: unchanged
        Assert.Equal("741:1", southStation.BusRoutes);
        var nubian = await db.Stations.SingleAsync(s => s.MbtaStopId == "place-nubn");
        Assert.Equal(("", "1:0,1:1"), (nubian.RouteId, nubian.BusRoutes));
        Assert.Null((await db.Stations.SingleAsync(s => s.MbtaStopId == "place-alfcl")).BusRoutes);

        var lookup = new StationLookupService(db);
        Assert.Equal(new[] { "Alewife", "South Station" }, (await lookup.GetAllStationsAsync()).Select(s => s.Name)); // subway only
        Assert.Equal(new[] { "1", "63", "place-nubn" }, (await lookup.GetAllStationsAsync("1")).Select(s => s.MbtaStopId).Order());
        Assert.Equal(new[] { "1", "place-nubn" }, (await lookup.GetAllStationsAsync("1", 0)).Select(s => s.MbtaStopId).Order());
        Assert.Equal(new[] { "1000" }, (await lookup.GetAllStationsAsync("10")).Select(s => s.MbtaStopId)); // "1" isn't "10"
        Assert.Equal(new[] { "17091", "place-sstat" }, (await lookup.GetAllStationsAsync("741", 1)).Select(s => s.MbtaStopId).Order());
        Assert.Empty(await lookup.GetAllStationsAsync("741", 0));
        Assert.DoesNotContain("place-sstat", (await lookup.GetBusStopsAsync()).Select(s => s.MbtaStopId)); // that's a /stations one
    }

    [Fact]
    public async Task Reimport_SameData_ChangesNothing()
    {
        using var db = TestDb.CreateClean();
        var mbta = Mbta();
        await new StationImportService(mbta, db).ImportStationsAsync();
        var before = await db.Stations.AsNoTracking().ToDictionaryAsync(s => s.MbtaStopId, s => s.UpdatedAtUtc);

        await new StationImportService(mbta, db).ImportStationsAsync();

        // Thousands of rows: only touch what changed.
        Assert.Equal(before, await db.Stations.AsNoTracking().ToDictionaryAsync(s => s.MbtaStopId, s => s.UpdatedAtUtc));
    }

    [Fact]
    public async Task Reimport_DropsStopsMbtaNoLongerLists_ButKeepsOnesACommuteUses_AndClearsSubwayBuses()
    {
        using var db = TestDb.CreateClean();
        var mbta = Mbta();
        await new StationImportService(mbta, db).ImportStationsAsync();
        var andrew = await db.Stations.SingleAsync(s => s.MbtaStopId == "1000");
        db.UserCommutes.Add(new UserCommute { UserId = "u", StationId = andrew.Id, RouteId = "10", DirectionId = 0 });
        await db.SaveChangesAsync();

        // Route 10 is gone; SL1 no longer reaches South Station; route 1 keeps running.
        mbta.StopsByRouteDirection.Remove(("10", 0));
        mbta.StopsByRouteDirection[("741", 1)] = new() { Stop("17091", "Terminal A") };
        mbta.StopsByRouteDirection[("1", 1)] = new() { Stop("63", "Washington St @ Ruggles St"), Stop("place-nubn", "Nubian") };
        await new StationImportService(mbta, db).ImportStationsAsync();

        Assert.True(await db.Stations.AnyAsync(s => s.MbtaStopId == "1000"));   // a commute uses it: kept
        Assert.Null((await db.Stations.SingleAsync(s => s.MbtaStopId == "place-sstat")).BusRoutes);
        Assert.Equal("Red", (await db.Stations.SingleAsync(s => s.MbtaStopId == "place-sstat")).RouteId);

        mbta.StopsByRouteDirection[("1", 0)] = new() { Stop("place-nubn", "Nubian") }; // stop "1" closes
        await new StationImportService(mbta, db).ImportStationsAsync();
        Assert.False(await db.Stations.AnyAsync(s => s.MbtaStopId == "1"));
    }

    [Fact]
    public async Task Reimport_WithAnEmptyOrHalfEmptyAnswer_DeletesNothing()
    {
        using var db = TestDb.CreateClean();
        var mbta = Mbta();
        await new StationImportService(mbta, db).ImportStationsAsync();
        var before = await db.Stations.CountAsync();

        mbta.StopsByRouteDirection.Clear(); // MBTA glitch: every bus route answers with no stops
        await new StationImportService(mbta, db).ImportStationsAsync();
        Assert.Equal(before, await db.Stations.CountAsync());

        mbta.StopsByRouteDirection[("10", 0)] = new() { Stop("1000", "Andrew Square") }; // 1 of 5 bus-only stops
        await new StationImportService(mbta, db).ImportStationsAsync();
        Assert.Equal(before, await db.Stations.CountAsync());
    }
}
