using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// LiveActivityUpdater: each round, every registered Live Activity gets its commute's next departures and worst
/// alert, or is ended when its window is over. Real SQL Server; MBTA and Apple faked.
/// </summary>
public class LiveActivityUpdaterTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-12T08:00:00-04:00");
    private static readonly string Token = new('a', 160);
    private readonly FakeMbtaClient _mbta = new();
    private readonly FakeApns _apns = new();

    // Alice's Red Line commute from Park Street, northbound, with its Live Activity registered until `endsAt`.
    private (LiveActivityUpdater Updater, int CommuteId) Seed(DateTimeOffset endsAt)
    {
        int commuteId;
        using (var db = TestDb.CreateClean())
        {
            var commute = new UserCommute
            {
                UserId = "alice", RouteId = "Red", DirectionId = 1, ActiveDays = "Mon,Tue,Wed,Thu,Fri",
                WindowStartLocal = new TimeSpan(7, 45, 0), WindowEndLocal = new TimeSpan(8, 30, 0),
                Station = new Station { MbtaStopId = "place-pktrm", Name = "Park Street", RouteId = "Green-B,Red" },
            };
            db.UserCommutes.Add(commute);
            db.SaveChanges();
            commuteId = commute.Id;
            db.LiveActivityTokens.Add(new LiveActivityToken { UserId = "alice", CommuteId = commuteId, Token = Token, EndsAtUtc = endsAt.UtcDateTime });
            db.SaveChanges();
        }
        var services = new ServiceCollection()
            .AddDbContext<NextTrainDbContext>(options => options.UseSqlServer(TestDb.ConnectionString))
            .AddSingleton<IMbtaClient>(_mbta)
            .BuildServiceProvider();
        return (new LiveActivityUpdater(services.GetRequiredService<IServiceScopeFactory>(), _apns, NullLogger<LiveActivityUpdater>.Instance), commuteId);
    }

    private static int Tokens()
    {
        using var db = TestDb.Open();
        return db.LiveActivityTokens.Count();
    }

    [Fact]
    public async Task DuringTheWindow_SendsTheNextThreeDeparturesTheWayYouGo_AndTheWorstMajorAlert()
    {
        var (updater, _) = Seed(Now.AddMinutes(30));
        _mbta.PredictionsByStop["place-pktrm"] =
        [
            FakeMbtaClient.Prediction("Red", 1, "2026-10-12T07:58:00-04:00"), // left two minutes ago
            FakeMbtaClient.Prediction("Red", 1, "2026-10-12T08:09:00-04:00"),
            FakeMbtaClient.Prediction("Red", 1, "2026-10-12T08:03:00-04:00"),
            FakeMbtaClient.Prediction("Red", 0, "2026-10-12T08:01:00-04:00"), // the other way
            FakeMbtaClient.Prediction("Green-B", 1, "2026-10-12T08:02:00-04:00"), // another line
            FakeMbtaClient.Prediction("Red", 1, "2026-10-12T08:15:00-04:00"),
            FakeMbtaClient.Prediction("Red", 1, "2026-10-12T08:21:00-04:00"),
        ];
        _mbta.Alerts.AddRange(
        [
            new MbtaAlertDto { Id = "1", Attributes = new() { Effect = "DELAY", Severity = 4, ServiceEffect = "Red Line delay", InformedEntity = [new() { Route = "Red" }] } },
            new MbtaAlertDto { Id = "2", Attributes = new() { Effect = "STATION_ISSUE", Severity = 1, ServiceEffect = "Escalator", InformedEntity = [new() { Route = "Red" }] } },
            new MbtaAlertDto { Id = "3", Attributes = new() { Effect = "SUSPENSION", Severity = 7, ServiceEffect = "Orange Line suspension", InformedEntity = [new() { Route = "Orange" }] } },
        ]);

        await updater.RunOnceAsync(Now);

        var (token, content, end) = Assert.Single(_apns.LiveActivityUpdates);
        Assert.Equal(Token, token);
        Assert.False(end);
        Assert.Equal(
            new[] { "08:03", "08:09", "08:15" },
            content.Departures.Select(t => DateTimeOffset.FromUnixTimeSeconds(t).ToOffset(TimeSpan.FromHours(-4)).ToString("HH:mm")));
        Assert.Equal("Red Line delay", content.Alert);
        Assert.Equal(DateTimeOffset.Parse("2026-10-12T08:03:00-04:00"), content.StaleAt); // redrawn when the 8:03 leaves
        Assert.Equal(Now.AddMinutes(30), content.EndsAt);
        Assert.Equal(1, Tokens()); // kept for the next minute
    }

    [Fact]
    public async Task WhenTheWindowEndsBeforeTheNextTrain_ItGoesStaleThen()
    {
        var (updater, _) = Seed(Now.AddMinutes(2));
        _mbta.PredictionsByStop["place-pktrm"] = [FakeMbtaClient.Prediction("Red", 1, "2026-10-12T08:09:00-04:00")];

        await updater.RunOnceAsync(Now);

        Assert.Equal(Now.AddMinutes(2), Assert.Single(_apns.LiveActivityUpdates).Content.StaleAt);
    }

    [Fact]
    public async Task AfterTheWindow_EndsIt_AndForgetsTheToken()
    {
        var (updater, _) = Seed(Now.AddMinutes(-1));

        await updater.RunOnceAsync(Now);

        Assert.True(Assert.Single(_apns.LiveActivityUpdates).End);
        Assert.Equal(0, Tokens());
    }

    [Fact]
    public async Task ADeletedCommute_EndsItsLiveActivity()
    {
        var (updater, commuteId) = Seed(Now.AddMinutes(30));
        using (var db = TestDb.Open()) db.UserCommutes.Where(c => c.Id == commuteId).ExecuteDelete();

        await updater.RunOnceAsync(Now);

        Assert.True(Assert.Single(_apns.LiveActivityUpdates).End);
        Assert.Equal(0, Tokens());
    }

    [Fact]
    public async Task ATokenAppleNoLongerTakes_IsForgotten()
    {
        var (updater, _) = Seed(Now.AddMinutes(30));
        _apns.Gone.Add(Token);

        await updater.RunOnceAsync(Now);

        Assert.Equal(0, Tokens());
    }
}
