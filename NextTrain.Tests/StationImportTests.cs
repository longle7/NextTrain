using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// MergeStops unit tests, plus an end-to-end import against a real SQL Server test database
/// with a fake MBTA client. Connection string defaults to local SQL Server; override with NEXTTRAIN_TEST_DB.
/// </summary>
public class StationImportTests
{
    private static MbtaStopDto Stop(string id, string name, double? lat = 42.35, double? lon = -71.06) =>
        new() { Id = id, Attributes = new MbtaStopAttributesDto { Name = name, Latitude = lat, Longitude = lon } };

    [Fact]
    public void MergeStops_TransferStation_GetsSortedCommaSeparatedRoutes()
    {
        var parkStreet = Stop("place-pktrm", "Park Street");

        var stations = StationImportService.MergeStops(new[]
        {
            ("Red", parkStreet),
            ("Green-B", parkStreet),
            ("Red", parkStreet), // duplicate route entry is collapsed
        });

        var station = Assert.Single(stations);
        Assert.Equal("place-pktrm", station.MbtaStopId);
        Assert.Equal("Green-B,Red", station.RouteId);
    }

    [Fact]
    public void MergeStops_SkipsStopsWithoutCoordinates()
    {
        var stations = StationImportService.MergeStops(new[]
        {
            ("Red", Stop("place-alfcl", "Alewife")),
            ("Red", Stop("no-lat", "No Lat", lat: null)),
            ("Red", Stop("no-lon", "No Lon", lon: null)),
        });

        Assert.Equal("place-alfcl", Assert.Single(stations).MbtaStopId);
    }

    private static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("NEXTTRAIN_TEST_DB")
        ?? "Server=localhost;Database=NextTrainDb_Tests;Trusted_Connection=True;TrustServerCertificate=True;";

    private class FakeMbtaClient : IMbtaClient
    {
        public Dictionary<string, List<MbtaStopDto>> StopsByRoute { get; } = new();

        public Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId) =>
            Task.FromResult<IReadOnlyList<MbtaStopDto>>(StopsByRoute.GetValueOrDefault(routeId) ?? new());
    }

    private static NextTrainDbContext CreateCleanDb()
    {
        var db = new NextTrainDbContext(new DbContextOptionsBuilder<NextTrainDbContext>()
            .UseSqlServer(ConnectionString).Options);
        db.Database.Migrate();
        db.Stations.ExecuteDelete();
        return db;
    }

    [Fact]
    public async Task Import_InsertsThenUpdates_AndRouteFilterMatchesTransferStations()
    {
        using var db = CreateCleanDb();
        var mbta = new FakeMbtaClient();
        mbta.StopsByRoute["Red"] = new() { Stop("place-pktrm", "Park Street"), Stop("place-alfcl", "Alewife") };
        mbta.StopsByRoute["Green-B"] = new() { Stop("place-pktrm", "Park Street") };

        await new StationImportService(mbta, db).ImportStationsAsync();

        var lookup = new StationLookupService(db);
        Assert.Equal(2, (await lookup.GetAllStationsAsync("Red")).Count);
        Assert.Equal("place-pktrm", Assert.Single(await lookup.GetAllStationsAsync("Green-B")).MbtaStopId);
        Assert.Empty(await lookup.GetAllStationsAsync("Green")); // no partial matches

        // Re-import with a renamed stop updates the existing row instead of inserting.
        mbta.StopsByRoute["Red"][1] = Stop("place-alfcl", "Alewife Renamed");
        await new StationImportService(mbta, db).ImportStationsAsync();

        Assert.Equal(2, await db.Stations.CountAsync());
        var alewife = await lookup.GetByMbtaStopIdAsync("place-alfcl");
        Assert.Equal("Alewife Renamed", alewife!.Name);
        Assert.NotNull(alewife.UpdatedAtUtc);
    }
}
