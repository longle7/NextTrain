using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NextTrain.Api.Services;
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

    private static (StationRefreshService Service, FakeImporter Importer) Create(string refreshHours, bool fail = false)
    {
        var importer = new FakeImporter { Fail = fail };
        var services = new ServiceCollection().AddScoped<IStationImportService>(_ => importer).BuildServiceProvider();
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
    public async Task ImportsOnStartup()
    {
        var (service, importer) = Create("24");

        await service.StartAsync(CancellationToken.None);
        await WaitFor(() => importer.Imports > 0);
        await service.StopAsync(CancellationToken.None);

        Assert.Equal(1, importer.Imports);
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
