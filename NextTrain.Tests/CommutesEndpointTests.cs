using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using NextTrain.Api.Controllers;
using NextTrain.Core.Domain;

namespace NextTrain.Tests;

/// <summary>
/// Calls the /commutes endpoints over HTTP against the real SQL Server test database.
/// </summary>
public class CommutesEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;

    public CommutesEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.Add(new Station { MbtaStopId = "place-pktrm", Name = "Park Street", Latitude = 42.3564, Longitude = -71.0624, RouteId = "Green-B,Red" });
            db.SaveChanges();
        }

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b
                .UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString)
                .UseSetting("Stations:RefreshHours", "0"));
    }

    public void Dispose() => _factory.Dispose();

    private HttpClient ClientFor(string userId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-User-Id", userId);
        return client;
    }

    private static CommuteRequest Request(string route = "Red", string start = "07:45", string end = "08:15", string days = "Mon,Tue,Wed,Thu,Fri") =>
        new("place-pktrm", route, 0, TimeOnly.Parse(start), TimeOnly.Parse(end), days);

    [Fact]
    public async Task Crud_RoundTrip()
    {
        using var alice = ClientFor("alice");

        var created = await alice.PostAsJsonAsync("/commutes", Request(days: "Fri, Mon"));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var commute = (await created.Content.ReadFromJsonAsync<CommuteResponse>())!;
        Assert.Equal("Park Street", commute.StationName);
        Assert.Equal("Mon,Fri", commute.ActiveDays); // normalized order

        var updated = await alice.PutAsJsonAsync($"/commutes/{commute.Id}", Request(route: "Green-B", start: "17:00", end: "17:30"));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        var fetched = await alice.GetFromJsonAsync<CommuteResponse>($"/commutes/{commute.Id}");
        Assert.Equal("Green-B", fetched!.RouteId);
        Assert.Equal(new TimeOnly(17, 0), fetched.WindowStart);

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync($"/commutes/{commute.Id}")).StatusCode);
        Assert.Empty((await alice.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
    }

    [Fact]
    public async Task OtherUsersCommutes_AreInvisible()
    {
        using var alice = ClientFor("alice");
        using var bob = ClientFor("bob");
        var created = await alice.PostAsJsonAsync("/commutes", Request());
        var id = (await created.Content.ReadFromJsonAsync<CommuteResponse>())!.Id;

        Assert.Empty((await bob.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/commutes/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/commutes/{id}", Request())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/commutes/{id}")).StatusCode);
        Assert.Single((await alice.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
    }

    [Theory]
    [InlineData("Blue", "07:45", "08:15", "Mon")]  // route doesn't serve station
    [InlineData("Red", "08:15", "07:45", "Mon")]   // window backwards
    [InlineData("Red", "07:45", "08:15", "Funday")]
    [InlineData("Red", "07:45", "08:15", "")]
    public async Task Create_InvalidRequest_Returns400(string route, string start, string end, string days)
    {
        using var alice = ClientFor("alice");

        var response = await alice.PostAsJsonAsync("/commutes", Request(route, start, end, days));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_UnknownStation_Returns400()
    {
        using var alice = ClientFor("alice");

        var response = await alice.PostAsJsonAsync("/commutes", Request() with { MbtaStopId = "place-nope" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_OverTheLimit_Returns400_WithAMessage()
    {
        using var alice = ClientFor("alice");
        for (var i = 0; i < CommutesController.MaxCommutesPerUser; i++)
        {
            Assert.Equal(HttpStatusCode.Created, (await alice.PostAsJsonAsync("/commutes", Request())).StatusCode);
        }

        var response = await alice.PostAsJsonAsync("/commutes", Request());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("up to 20 commutes", await response.Content.ReadAsStringAsync());
        using var bob = ClientFor("bob");
        Assert.Equal(HttpStatusCode.Created, (await bob.PostAsJsonAsync("/commutes", Request())).StatusCode); // per user
    }

    [Fact]
    public async Task MissingUserIdHeader_Returns400()
    {
        using var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync("/commutes")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.DeleteAsync("/me")).StatusCode);
    }

    [Fact]
    public async Task DeleteMe_RemovesAllOfThatUsersData_AndNobodyElses()
    {
        using var alice = ClientFor("alice");
        using var bob = ClientFor("bob");
        await alice.PostAsJsonAsync("/commutes", Request());
        await bob.PostAsJsonAsync("/commutes", Request());
        await alice.PutAsJsonAsync("/me/push-token", PushToken('a'));
        await bob.PutAsJsonAsync("/me/push-token", PushToken('b'));
        using (var db = TestDb.Open())
        {
            db.SentNotifications.AddRange(new SentNotification { UserId = "alice", AlertId = "1" }, new SentNotification { UserId = "bob", AlertId = "1" });
            db.SaveChanges();
        }

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync("/me")).StatusCode);

        Assert.Empty((await alice.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
        Assert.Single((await bob.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
        Assert.Equal(["bob:b"], PushDevices());
        using var after = TestDb.Open();
        Assert.Equal(["bob"], after.SentNotifications.Select(n => n.UserId));
    }

    private static PushTokenRequest PushToken(char hex) => new(new string(hex, 64));

    // "user:first character of the token", by user.
    private static List<string> PushDevices()
    {
        using var db = TestDb.Open();
        return db.PushDevices.OrderBy(d => d.UserId).Select(d => d.UserId + ":" + d.Token.Substring(0, 1)).ToList();
    }

    [Fact]
    public async Task PushToken_OnePhonePerUser_AndATokenMovesToTheLatestUser()
    {
        using var alice = ClientFor("alice");
        using var bob = ClientFor("bob");

        Assert.Equal(HttpStatusCode.NoContent, (await alice.PutAsJsonAsync("/me/push-token", PushToken('a'))).StatusCode);
        await alice.PutAsJsonAsync("/me/push-token", PushToken('b')); // iOS gave the phone a new token
        Assert.Equal(["alice:b"], PushDevices());

        await bob.PutAsJsonAsync("/me/push-token", PushToken('b')); // same phone, new user ID (iOS cleared the app's storage)
        Assert.Equal(["bob:b"], PushDevices());

        Assert.Equal(HttpStatusCode.NoContent, (await bob.DeleteAsync("/me/push-token")).StatusCode);
        Assert.Empty(PushDevices());
    }

    [Fact]
    public async Task LiveActivity_OnlyForYourOwnCommute_UntilItsWindowEnds_OnePerUser()
    {
        using var alice = ClientFor("alice");
        using var bob = ClientFor("bob");
        var commute = (await (await alice.PostAsJsonAsync("/commutes", Request())).Content.ReadFromJsonAsync<CommuteResponse>())!;
        var inHalfAnHour = DateTimeOffset.UtcNow.AddMinutes(30).ToUnixTimeSeconds();
        LiveActivityRequest Activity(char hex, long? endsAt = null) => new(commute.Id, new string(hex, 160), endsAt ?? inHalfAnHour);

        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync("/me/live-activity", Activity('b'))).StatusCode); // not Bob's commute
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.PutAsJsonAsync("/me/live-activity", Activity('a', DateTimeOffset.UtcNow.AddMinutes(-1).ToUnixTimeSeconds()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.PutAsJsonAsync("/me/live-activity", Activity('z'))).StatusCode); // not hex

        Assert.Equal(HttpStatusCode.NoContent, (await alice.PutAsJsonAsync("/me/live-activity", Activity('a'))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.PutAsJsonAsync("/me/live-activity", Activity('c'))).StatusCode); // a new one replaces it
        using (var db = TestDb.Open())
        {
            var token = Assert.Single(db.LiveActivityTokens);
            Assert.Equal(("alice", 'c'), (token.UserId, token.Token[0]));
        }

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync("/me/live-activity")).StatusCode);
        using (var db = TestDb.Open()) Assert.Empty(db.LiveActivityTokens);

        await alice.PutAsJsonAsync("/me/live-activity", Activity('a'));
        await alice.DeleteAsync("/me"); // Delete my data
        using (var db = TestDb.Open()) Assert.Empty(db.LiveActivityTokens);
    }

    [Fact]
    public async Task PushToken_NotAnAppleToken_Returns400()
    {
        using var alice = ClientFor("alice");

        foreach (var token in new[] { "", "abc123", new string('z', 64), new string('a', 201) })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await alice.PutAsJsonAsync("/me/push-token", new PushTokenRequest(token))).StatusCode);
        }
        Assert.Empty(PushDevices());
    }
}
