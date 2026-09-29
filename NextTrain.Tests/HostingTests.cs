using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace NextTrain.Tests;

/// <summary>
/// What a host and the iPhone app need from the API: a health probe, and CORS for the app's origin.
/// </summary>
public class HostingTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory = new WebApplicationFactory<Program>()
        .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString));

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Health_IsHealthy_WhenTheDatabaseIsReachable()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("capacitor://localhost", true)] // the iPhone app
    [InlineData("https://evil.example", false)]
    public async Task Cors_AllowsOnlyConfiguredOrigins_IncludingTheUserIdHeader(string origin, bool allowed)
    {
        using var client = _factory.CreateClient();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/commutes");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-user-id");

        var response = await client.SendAsync(preflight);

        Assert.Equal(allowed, response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) && values.Single() == origin);
    }
}
