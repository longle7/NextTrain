using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Imports stations from MBTA when the API starts and then every Stations:RefreshHours (default 24), so a fresh
    /// deployment isn't empty and new or renamed stations show up on their own. 0 turns it off (the tests do).
    /// </summary>
    public class StationRefreshService : BackgroundService
    {
        // After a failed import (MBTA down or rate-limited), try again sooner than the regular refresh.
        public static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(5);

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

            while (!stoppingToken.IsCancellationRequested)
            {
                var wait = _interval;
                try
                {
                    // The importer and its DbContext are scoped; a background service needs its own scope.
                    using var scope = _scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<IStationImportService>().ImportStationsAsync();
                    _log.LogInformation("Stations imported from MBTA; next refresh in {Interval}.", _interval);
                }
                catch (Exception e)
                {
                    // Never let a failed import escape: an exception here would stop the whole API.
                    _log.LogWarning(e, "Station import failed; retrying in {Delay}.", RetryDelay);
                    wait = RetryDelay;
                }
                await Task.Delay(wait, stoppingToken);
            }
        }
    }
}
