using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using NextTrain.Core.Domain;

namespace NextTrain.Tests;

/// <summary>
/// Calls the /stations endpoints over HTTP against the real SQL Server test database.
/// </summary>
public class StationsEndpointTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public StationsEndpointTests()
    {
        using (var db = TestDb.CreateClean())
        {
            db.Stations.AddRange(
                new Station { MbtaStopId = "place-pktrm", Name = "Park Street", Latitude = 42.3564, Longitude = -71.0624, RouteId = "Green-B,Red" },
                new Station { MbtaStopId = "place-gover", Name = "Government Center", Latitude = 42.3597, Longitude = -71.0592, RouteId = "Blue,Green-B" },
                new Station { MbtaStopId = "place-alfcl", Name = "Alewife", Latitude = 42.3958, Longitude = -71.1418, RouteId = "Red" });
            db.SaveChanges();
        }

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString));
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task GetAll_FiltersByRoute_SortedByName()
    {
        var stations = await _client.GetFromJsonAsync<List<Station>>("/stations?route=Red");

        Assert.Equal(new[] { "Alewife", "Park Street" }, stations!.Select(s => s.Name));
    }

    [Fact]
    public async Task GetNearest_ReturnsClosestStation_OnRequestedRoute()
    {
        // Standing at Park Street: nearest overall is Park Street, nearest Blue Line is Government Center.
        var any = await _client.GetFromJsonAsync<Station>("/stations/nearest?lat=42.3564&lon=-71.0624");
        var blue = await _client.GetFromJsonAsync<Station>("/stations/nearest?lat=42.3564&lon=-71.0624&route=Blue");

        Assert.Equal("place-pktrm", any!.MbtaStopId);
        Assert.Equal("place-gover", blue!.MbtaStopId);
    }

    [Theory]
    [InlineData("/stations/nearest?lat=91&lon=-71")]
    [InlineData("/stations/nearest?lat=42&lon=-181")]
    [InlineData("/stations/nearest?lon=-71")]
    [InlineData("/stations/nearest?lat=abc&lon=-71")]
    public async Task GetNearest_InvalidCoordinates_Returns400(string url)
    {
        var response = await _client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/stations/nearest?lat=42.36&lon=-71.06&route=Orange")] // no stations on route
    [InlineData("/stations/place-unknown")]
    public async Task UnknownStation_Returns404(string url)
    {
        var response = await _client.GetAsync(url);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_ReturnsStation()
    {
        var station = await _client.GetFromJsonAsync<Station>("/stations/place-alfcl");

        Assert.Equal("Alewife", station!.Name);
    }
}
