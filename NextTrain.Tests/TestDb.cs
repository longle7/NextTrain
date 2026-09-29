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

    /// <summary>Migrates the test database and deletes all stations.</summary>
    public static NextTrainDbContext CreateClean()
    {
        var db = new NextTrainDbContext(new DbContextOptionsBuilder<NextTrainDbContext>()
            .UseSqlServer(ConnectionString).Options);
        db.Database.Migrate();
        db.Stations.ExecuteDelete();
        return db;
    }
}
