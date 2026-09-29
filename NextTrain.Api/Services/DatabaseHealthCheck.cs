using Microsoft.Extensions.Diagnostics.HealthChecks;
using NextTrain.Api.Data;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// GET /health reports Unhealthy (503) when SQL Server can't be reached, so a host can restart or stop routing to us.
    /// </summary>
    public class DatabaseHealthCheck : IHealthCheck
    {
        private readonly NextTrainDbContext _db;

        public DatabaseHealthCheck(NextTrainDbContext db)
        {
            _db = db;
        }

        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default) =>
            await _db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("Can't reach the database.");
    }
}
