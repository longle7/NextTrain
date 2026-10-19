using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Imports stations from MBTA every Stations:RefreshHours (default 24), so new or renamed stations show up on their
    /// own. 0 turns it off (the tests do). An empty database (a fresh deployment) is filled when the API starts; one that
    /// has stations waits StartupDelay first, so a short wake-up (a visitor or the uptime check overnight, which then
    /// lets it scale back to zero) costs no import. A copy started at 4:30 AM imports at 4:40, once a day.
    /// </summary>
    public class StationRefreshService : BackgroundService
    {
        // After a failed import (MBTA down or rate-limited), try again sooner than the regular refresh.
        public static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(5);

        // How long a start with stations already in the database waits before importing: longer than Azure keeps an idle
        // copy running (5 minutes) after a wake-up.
        public static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(10);

        private readonly IServiceScopeFactory _scopes;
        private readonly TimeSpan _interval;
        private readonly ILogger<StationRefreshService> _log;

        public StationRefreshService(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<StationRefreshService> log)
        {
            _scopes = scopes;
            _interval = TimeSpan.FromHours(configuration.GetValue("Stations:RefreshHours", 24.0));
            _log = log;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (_interval <= TimeSpan.Zero) return;

            var starting = true;
            while (!stoppingToken.IsCancellationRequested)
            {
                var wait = _interval;
                try
                {
                    // The importer and its DbContext are scoped; a background service needs its own scope.
                    using var scope = _scopes.CreateScope();
                    if (starting && await scope.ServiceProvider.GetRequiredService<NextTrainDbContext>().Stations.AnyAsync(stoppingToken))
                    {
                        wait = StartupDelay;
                    }
                    else
                    {
                        await scope.ServiceProvider.GetRequiredService<IStationImportService>().ImportStationsAsync();
                        _log.LogInformation("Stations imported from MBTA; next refresh in {Interval}.", _interval);
                    }
                }
                catch (Exception e)
                {
                    // Never let a failed import escape: an exception here would stop the whole API.
                    _log.LogWarning(e, "Station import failed; retrying in {Delay}.", RetryDelay);
                    wait = RetryDelay;
                }
                starting = false;
                await Task.Delay(wait, stoppingToken);
            }
        }
    }
}
