using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Keeps Live Activities counting down with the app closed. Every minute, each registered Live Activity
    /// (PUT /me/live-activity) gets its commute's next three departures and worst alert through Apple's push service,
    /// the same ones the app would show. When the commute window is over, or the commute was deleted, it's ended and
    /// forgotten. Off until an APNs key is configured (see ApnsSender).
    /// ponytail: one push per activity per minute, in sequence; batch or run in parallel past a few hundred riders.
    /// </summary>
    public class LiveActivityUpdater : BackgroundService
    {
        // MBTA's alerts in severity order: 3 and up change how you travel (the app's MAJOR_SEVERITY).
        private const int MajorSeverity = 3;

        private readonly IServiceScopeFactory _scopes;
        private readonly IApnsSender _apns;
        private readonly ILogger<LiveActivityUpdater> _logger;

        public LiveActivityUpdater(IServiceScopeFactory scopes, IApnsSender apns, ILogger<LiveActivityUpdater> logger)
        {
            _scopes = scopes;
            _apns = apns;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_apns.IsConfigured) return; // DelayNotifier already logs that push is off
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
            do
            {
                try
                {
                    await RunOnceAsync(DateTimeOffset.UtcNow, stoppingToken);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    _logger.LogWarning(e, "Live Activity updates: this round failed; trying again in a minute.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }

        /// <summary>One round: update every Live Activity, or end it. Public for tests.</summary>
        public async Task RunOnceAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NextTrainDbContext>();
            var mbta = scope.ServiceProvider.GetRequiredService<IMbtaClient>();

            foreach (var activity in await db.LiveActivityTokens.ToListAsync(cancellationToken))
            {
                var commute = await db.UserCommutes.Include(c => c.Station)
                    .FirstOrDefaultAsync(c => c.Id == activity.CommuteId && c.UserId == activity.UserId, cancellationToken);
                var endsAt = new DateTimeOffset(activity.EndsAtUtc, TimeSpan.Zero);
                var end = commute is null || endsAt <= now;
                var content = end ? new LiveActivityContent([], null, endsAt) : await ContentAsync(mbta, commute!, endsAt, now);
                var result = await _apns.UpdateLiveActivityAsync(activity.Token, content, end, cancellationToken);
                if (end || result == ApnsResult.Unregistered) db.LiveActivityTokens.Remove(activity);
            }
            await db.SaveChangesAsync(cancellationToken);
        }

        /// <summary>The commute's next three departures and its worst major alert, as the app's Home card shows them.</summary>
        public static async Task<LiveActivityContent> ContentAsync(IMbtaClient mbta, UserCommute commute, DateTimeOffset endsAt, DateTimeOffset now)
        {
            var departures = (await mbta.GetPredictionsAsync(commute.Station!.MbtaStopId, commute.RouteId))
                .Where(p => p.Relationships.Route.Data.Id == commute.RouteId && p.Attributes.DirectionId == commute.DirectionId)
                .Select(p => p.Attributes.DepartureTime)
                .OfType<DateTimeOffset>()
                .Where(t => t >= now.AddSeconds(-15)) // the app counts a train as boarding until 15 s after it leaves
                .Order()
                .Take(3)
                .Select(t => t.ToUnixTimeSeconds())
                .ToList();

            var subway = commute.Station.SubwayRouteIds().Contains(commute.RouteId);
            var alerts = subway ? await mbta.GetSubwayAlertsAsync() : await mbta.GetRouteAlertsAsync(commute.RouteId);
            var worst = alerts
                .Where(a => a.Attributes.Severity >= MajorSeverity && DelayNotifier.Covers(a, commute))
                .MaxBy(a => a.Attributes.Severity);
            var alert = worst is null ? null : string.IsNullOrWhiteSpace(worst.Attributes.ServiceEffect) ? worst.Attributes.Header : worst.Attributes.ServiceEffect;
            return new LiveActivityContent(departures, alert, endsAt);
        }
    }
}
