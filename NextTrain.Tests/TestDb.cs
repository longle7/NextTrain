using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;

// All tests share one SQL Server test database, so run them one at a time.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace NextTrain.Tests;

/// <summary>
/// Real SQL Server test database. Defaults to local SQL Server; override with NEXTTRAIN_TEST_DB.
/// </summary>
public static class TestDb
{
    public static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("NEXTTRAIN_TEST_DB")
        ?? "Server=localhost;Database=NextTrainDb_Tests;Trusted_Connection=True;TrustServerCertificate=True;";

    /// <summary>The API on the test database, with the startup station import off; `more` adds a test's own setup.</summary>
    public static WebApplicationFactory<Program> Api(Action<IWebHostBuilder>? more = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:DefaultConnection", ConnectionString).UseSetting("Stations:RefreshHours", "0");
            more?.Invoke(b);
        });

    public static NextTrainDbContext Open() =>
        new(new DbContextOptionsBuilder<NextTrainDbContext>().UseSqlServer(ConnectionString).Options);

    /// <summary>Migrates the test database and deletes all stations and user data.</summary>
    public static NextTrainDbContext CreateClean()
    {
        var db = Open();
        db.Database.Migrate();
        db.UserCommutes.ExecuteDelete(); // FK to Stations, delete first
        db.PushDevices.ExecuteDelete();
        db.SentNotifications.ExecuteDelete();
        db.LiveActivityTokens.ExecuteDelete();
        db.Stations.ExecuteDelete();
        return db;
    }
}

/// <summary>A clock stopped at `now`, for the API's TimeProvider.</summary>
public class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();
}
