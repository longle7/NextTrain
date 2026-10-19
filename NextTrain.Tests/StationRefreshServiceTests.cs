using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

public class StationRefreshServiceTests
{
    // Counts imports; throws when told to, like MBTA being down.
    private class FakeImporter : IStationImportService
    {
        public int Imports;
        public bool Fail { get; init; }

        public Task ImportStationsAsync()
        {
            Interlocked.Increment(ref Imports);
            return Fail ? Task.FromException(new HttpRequestException("MBTA down")) : Task.CompletedTask;
        }
    }

    // With an empty Stations table, unless `withStations`.
    private static (StationRefreshService Service, FakeImporter Importer) Create(string refreshHours, bool fail = false, bool withStations = false)
    {
        using (var db = TestDb.CreateClean())
        {
            if (withStations) db.Stations.Add(new Station { MbtaStopId = "place-alfcl", Name = "Alewife", RouteId = "Red" });
            db.SaveChanges();
        }
        var importer = new FakeImporter { Fail = fail };
        var services = new ServiceCollection()
            .AddScoped<IStationImportService>(_ => importer)
            .AddDbContext<NextTrainDbContext>(options => options.UseSqlServer(TestDb.ConnectionString))
            .BuildServiceProvider();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Stations:RefreshHours"] = refreshHours })
            .Build();
        return (new StationRefreshService(services.GetRequiredService<IServiceScopeFactory>(), configuration,
            NullLogger<StationRefreshService>.Instance), importer);
    }

    private static async Task WaitFor(Func<bool> condition)
    {
        for (var i = 0; i < 50 && !condition(); i++) await Task.Delay(100);
    }

    [Fact]
    public async Task ImportsOnStartup_WhenTheDatabaseIsEmpty()
    {
        var (service, importer) = Create("24");

        await service.StartAsync(CancellationToken.None);
        await WaitFor(() => importer.Imports > 0);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(1, importer.Imports);
    }

    [Fact]
    public async Task WithStationsAlready_WaitsBeforeImporting()
    {
        // A restart (a deploy, a visitor waking it overnight) shouldn't import at once: the database has stations.
        var (service, importer) = Create("24", withStations: true);

        await service.StartAsync(CancellationToken.None);
        await Task.Delay(500);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(0, importer.Imports);
    }

    [Fact]
    public async Task AFailedImport_KeepsTheServiceRunning()
    {
        var (service, importer) = Create("24", fail: true);

        await service.StartAsync(CancellationToken.None);
        await WaitFor(() => importer.Imports > 0);

        Assert.False(service.ExecuteTask!.IsCompleted); // still waiting to retry, not crashed
        await service.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task ZeroHours_TurnsItOff()
    {
        var (service, importer) = Create("0");

        await service.StartAsync(CancellationToken.None);
        await Task.Delay(300);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(0, importer.Imports);
    }
}
