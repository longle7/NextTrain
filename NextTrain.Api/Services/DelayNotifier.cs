using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Delay notifications. Every minute: the commutes that are on, or start within 30 minutes (Boston time), of riders
    /// with notifications on; the major alerts on each one's line, station, and direction (as its Home card shows them);
    /// one notification per rider and alert. Off until an APNs key is configured (see ApnsSender).
    /// The API keeps one copy running during service hours (its scale rule), so this runs whenever trains do.
    /// ponytail: assumes one copy; with more, two could send the same alert. Claim alerts in the database first if it scales out.
    /// </summary>
    public class DelayNotifier : BackgroundService
    {
        // How long before a commute starts its alerts are sent: time to change plans before leaving.
        public static readonly TimeSpan Lead = TimeSpan.FromMinutes(30);

        // An alert still on after this is sent again: a weekly reminder during a long shutdown.
        public static readonly TimeSpan KeepSent = TimeSpan.FromDays(7);

        private static readonly TimeZoneInfo Boston = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        // Effects that change the trip even at moderate severity. Anything else needs severity 5 or more (about a
        // 20-minute delay); MBTA marks smaller things (a closed staircase, minor delays) lower.
        private static readonly HashSet<string> Disruptions =
            ["SUSPENSION", "SHUTTLE", "NO_SERVICE", "STATION_CLOSURE", "STOP_CLOSURE", "DETOUR", "STOP_MOVE", "STOP_MOVED"];

        private readonly IServiceScopeFactory _scopes;
        private readonly IApnsSender _apns;
        private readonly ILogger<DelayNotifier> _logger;

        public DelayNotifier(IServiceScopeFactory scopes, IApnsSender apns, ILogger<DelayNotifier> logger)
        {
            _scopes = scopes;
            _apns = apns;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_apns.IsConfigured)
            {
                _logger.LogInformation("Delay notifications are off: no APNs key is configured.");
                return;
            }
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
            do
            {
                try
                {
                    await RunOnceAsync(DateTimeOffset.UtcNow, stoppingToken);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    _logger.LogWarning(e, "Delay notifications: this round failed; trying again in a minute.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }

        /// <summary>One round: what's due, sent, and remembered. Public for tests.</summary>
        public async Task RunOnceAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<NextTrainDbContext>();
            var mbta = scope.ServiceProvider.GetRequiredService<IMbtaClient>();

            // ponytail: reads every notified rider's commutes each minute; filter by day and time in SQL past ~10,000 riders.
            var bostonNow = TimeZoneInfo.ConvertTime(now, Boston).DateTime;
            var due = (await db.UserCommutes
                    .Include(c => c.Station)
                    .Where(c => db.PushDevices.Any(d => d.UserId == c.UserId))
                    .ToListAsync(cancellationToken))
                .Where(c => IsDue(c, bostonNow))
                .ToList();

            if (due.Count > 0)
            {
                // The subway's alerts come as one shared list; buses' only per route.
                var alerts = (await mbta.GetSubwayAlertsAsync()).ToList();
                var busRoutes = due.Where(c => !c.Station!.SubwayRouteIds().Contains(c.RouteId)).Select(c => c.RouteId).Distinct().Order().ToList();
                if (busRoutes.Count > 0) alerts.AddRange(await mbta.GetRouteAlertsAsync(string.Join(",", busRoutes)));

                var userIds = due.Select(c => c.UserId).Distinct().ToList();
                var devices = await db.PushDevices.Where(d => userIds.Contains(d.UserId)).ToDictionaryAsync(d => d.UserId, cancellationToken);
                var sent = (await db.SentNotifications
                        .Where(n => userIds.Contains(n.UserId))
                        .Select(n => new { n.UserId, n.AlertId })
                        .ToListAsync(cancellationToken))
                    .Select(n => (n.UserId, n.AlertId))
                    .ToHashSet();

                foreach (var (userId, alert) in Matches(due, alerts).Where(m => !sent.Contains((m.UserId, m.Alert.Id))))
                {
                    if (!devices.TryGetValue(userId, out var device)) continue; // its token stopped working earlier this round
                    var title = string.IsNullOrWhiteSpace(alert.Attributes.ServiceEffect) ? "Alert on your commute" : alert.Attributes.ServiceEffect;
                    if (await _apns.SendAsync(device.Token, title, alert.Attributes.Header, cancellationToken) == ApnsResult.Unregistered)
                    {
                        db.PushDevices.Remove(device); // the app was deleted, or its notifications turned off in iOS Settings
                        devices.Remove(userId);
                    }
                    db.SentNotifications.Add(new SentNotification { UserId = userId, AlertId = alert.Id });
                    await db.SaveChangesAsync(cancellationToken); // one at a time: a failure later in the round doesn't resend this one
                }
            }

            var forgetBefore = now.UtcDateTime - KeepSent;
            await db.SentNotifications.Where(n => n.SentAtUtc < forgetBefore).ExecuteDeleteAsync(cancellationToken);
        }

        /// <summary>Whether a commute is on, or starts within <see cref="Lead"/>, on one of its days. Times are Boston's.</summary>
        public static bool IsDue(UserCommute commute, DateTime bostonNow)
        {
            var day = bostonNow.DayOfWeek.ToString()[..3]; // "Mon", as ActiveDays has them
            var time = bostonNow.TimeOfDay;
            return commute.ActiveDays.Split(',').Contains(day) && commute.WindowStartLocal - Lead <= time && time < commute.WindowEndLocal;
        }

        /// <summary>Each rider's alerts worth a notification: major ones on a due commute's route, station, and direction.</summary>
        public static IEnumerable<(string UserId, MbtaAlertDto Alert)> Matches(IEnumerable<UserCommute> commutes, IEnumerable<MbtaAlertDto> alerts)
        {
            var major = alerts.Where(a => a.Attributes.Severity >= 5 || (a.Attributes.Severity >= 3 && Disruptions.Contains(a.Attributes.Effect))).ToList();
            return commutes
                .SelectMany(c => major
                    .Where(a => a.Attributes.InformedEntity.Any(e =>
                        (e.Route is null || e.Route == c.RouteId) &&
                        (e.Stop is null || e.Stop == c.Station!.MbtaStopId) &&
                        (e.DirectionId is null || e.DirectionId == c.DirectionId)))
                    .Select(a => (UserId: c.UserId, Alert: a)))
                .DistinctBy(m => (m.UserId, m.Alert.Id));
        }
    }
}
