using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// DelayNotifier: which commutes are due, which alerts are worth a notification, and whole rounds against the real
/// SQL Server test database, with MBTA and Apple's push service replaced by fakes.
/// </summary>
public class DelayNotifierTests
{
    // Records what would have gone to Apple; answers Unregistered for the tokens in Gone.
    private class FakeApns : IApnsSender
    {
        public List<(string Token, string Title, string Body)> Sent { get; } = new();
        public HashSet<string> Gone { get; } = new();
        public bool IsConfigured => true;

        public Task<ApnsResult> SendAsync(string deviceToken, string title, string body, CancellationToken cancellationToken = default)
        {
            Sent.Add((deviceToken, title, body));
            return Task.FromResult(Gone.Contains(deviceToken) ? ApnsResult.Unregistered : ApnsResult.Sent);
        }
    }

    private static readonly Station ParkStreet = new() { MbtaStopId = "place-pktrm", Name = "Park Street", RouteId = "Green-B,Red" };
    private static readonly string AliceToken = new('a', 64), CarolToken = new('c', 64);

    // Monday 7:45 AM in Boston (EDT): 15 minutes before the 8:00-8:30 commutes below.
    private static readonly DateTimeOffset MondayMorning = new(2026, 10, 12, 7, 45, 0, TimeSpan.FromHours(-4));

    private readonly FakeMbtaClient _mbta = new();
    private readonly FakeApns _apns = new();

    private static UserCommute Commute(string userId = "alice", string route = "Red", int direction = 0, Station? station = null) => new()
    {
        UserId = userId,
        Station = station ?? ParkStreet,
        RouteId = route,
        DirectionId = direction,
        WindowStartLocal = new TimeSpan(8, 0, 0),
        WindowEndLocal = new TimeSpan(8, 30, 0),
        ActiveDays = "Mon,Tue,Wed,Thu,Fri",
    };

    private static MbtaAlertDto Alert(string id, string effect, int severity, string? route = "Red", string? stop = null, int? direction = null) => new()
    {
        Id = id,
        Attributes = new()
        {
            Effect = effect,
            Severity = severity,
            ServiceEffect = $"{id} summary",
            Header = $"{id} header",
            InformedEntity = [new() { Route = route, Stop = stop, DirectionId = direction }],
        },
    };

    [Theory]
    [InlineData("2026-10-12 07:30", true)]  // Monday, half an hour before
    [InlineData("2026-10-12 07:29", false)]
    [InlineData("2026-10-12 08:29", true)]  // during
    [InlineData("2026-10-12 08:30", false)] // over
    [InlineData("2026-10-10 08:00", false)] // Saturday
    public void IsDue_FromHalfAnHourBefore_ToTheEnd_OnItsDays(string bostonNow, bool due) =>
        Assert.Equal(due, DelayNotifier.IsDue(Commute(), DateTime.Parse(bostonNow, CultureInfo.InvariantCulture)));

    [Fact]
    public void Matches_MajorAlerts_OnTheCommutesLineStationAndDirection()
    {
        MbtaAlertDto[] alerts =
        [
            Alert("whole-line", "DELAY", 6),
            Alert("this-station", "STATION_CLOSURE", 3, stop: "place-pktrm"),
            Alert("this-way", "SUSPENSION", 7, direction: 0),
            Alert("other-station", "STATION_CLOSURE", 7, stop: "place-alfcl"),
            Alert("other-way", "SUSPENSION", 7, direction: 1),
            Alert("other-line", "SUSPENSION", 7, route: "Orange"),
            Alert("short-delay", "DELAY", 4),
            Alert("minor-issue", "STATION_ISSUE", 3),
        ];

        var matched = DelayNotifier.Matches([Commute()], alerts).Select(m => m.Alert.Id);

        Assert.Equal(["whole-line", "this-station", "this-way"], matched);
    }

    [Fact]
    public void Matches_EachAlertOncePerRider_EvenWhenTwoOfTheirCommutesMatch()
    {
        var matched = DelayNotifier.Matches([Commute(), Commute(direction: 1), Commute(userId: "bob")], [Alert("red", "SUSPENSION", 7)]);

        Assert.Equal(["alice", "bob"], matched.Select(m => m.UserId));
    }

    // Alice rides the Red Line and Carol the 1 bus, both with notifications on; Bob rides the Red Line with them off.
    private DelayNotifier Seed()
    {
        using (var db = TestDb.CreateClean())
        {
            var parkStreet = new Station { MbtaStopId = "place-pktrm", Name = "Park Street", RouteId = "Green-B,Red" };
            var busStop = new Station { MbtaStopId = "110", Name = "Massachusetts Ave @ Holyoke St", BusRoutes = "1:0" };
            db.UserCommutes.AddRange(
                Commute(station: parkStreet),
                Commute(userId: "bob", station: parkStreet),
                Commute(userId: "carol", route: "1", station: busStop));
            db.PushDevices.AddRange(new PushDevice { UserId = "alice", Token = AliceToken }, new PushDevice { UserId = "carol", Token = CarolToken });
            db.SaveChanges();
        }
        var services = new ServiceCollection()
            .AddDbContext<NextTrainDbContext>(options => options.UseSqlServer(TestDb.ConnectionString))
            .AddSingleton<IMbtaClient>(_mbta)
            .BuildServiceProvider();
        return new DelayNotifier(services.GetRequiredService<IServiceScopeFactory>(), _apns, NullLogger<DelayNotifier>.Instance);
    }

    [Fact]
    public async Task ARound_NotifiesRidersWithNotificationsOn_OncePerAlert()
    {
        var notifier = Seed();
        _mbta.Alerts.Add(Alert("red", "SUSPENSION", 7));
        _mbta.RouteAlerts["1"] = [Alert("detour", "DETOUR", 3, route: "1")];

        await notifier.RunOnceAsync(MondayMorning);
        await notifier.RunOnceAsync(MondayMorning.AddMinutes(1));

        Assert.Equal([(AliceToken, "red summary", "red header"), (CarolToken, "detour summary", "detour header")], _apns.Sent.Order());
        using var db = TestDb.Open();
        Assert.Equal(["alice:red", "carol:detour"], db.SentNotifications.OrderBy(n => n.UserId).Select(n => n.UserId + ":" + n.AlertId));
    }

    [Fact]
    public async Task ARound_OutsideTheCommutes_SendsNothing()
    {
        var notifier = Seed();
        _mbta.Alerts.Add(Alert("red", "SUSPENSION", 7));

        await notifier.RunOnceAsync(MondayMorning.AddHours(2));

        Assert.Empty(_apns.Sent);
    }

    [Fact]
    public async Task ATokenAppleNoLongerTakes_IsRemoved()
    {
        var notifier = Seed();
        _mbta.Alerts.Add(Alert("red", "SUSPENSION", 7));
        _apns.Gone.Add(AliceToken);

        await notifier.RunOnceAsync(MondayMorning);

        using var db = TestDb.Open();
        Assert.Equal(["carol"], db.PushDevices.Select(d => d.UserId));
    }

    [Fact]
    public async Task SentNotifications_AreForgottenAfterAWeek()
    {
        var notifier = Seed();
        using (var db = TestDb.Open())
        {
            db.SentNotifications.AddRange(
                new SentNotification { UserId = "alice", AlertId = "old", SentAtUtc = MondayMorning.UtcDateTime.AddDays(-8) },
                new SentNotification { UserId = "alice", AlertId = "recent", SentAtUtc = MondayMorning.UtcDateTime.AddDays(-6) });
            db.SaveChanges();
        }

        await notifier.RunOnceAsync(MondayMorning);

        using var after = TestDb.Open();
        Assert.Equal(["recent"], after.SentNotifications.Select(n => n.AlertId));
    }
}
