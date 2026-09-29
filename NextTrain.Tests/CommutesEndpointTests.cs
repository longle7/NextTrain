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
            .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString));
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
        using (var db = TestDb.Open())
        {
            db.NotificationSubscriptions.AddRange(
                new NotificationSubscription { UserId = "alice", EndpointOrToken = "alice-device" },
                new NotificationSubscription { UserId = "bob", EndpointOrToken = "bob-device" });
            db.UserLocationPreferences.Add(new UserLocationPreference { UserId = "alice" });
            db.SaveChanges();
        }

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync("/me")).StatusCode);

        Assert.Empty((await alice.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
        Assert.Single((await bob.GetFromJsonAsync<List<CommuteResponse>>("/commutes"))!);
        using var check = TestDb.Open();
        Assert.Equal("bob", Assert.Single(check.NotificationSubscriptions).UserId);
        Assert.Empty(check.UserLocationPreferences);
    }
}
