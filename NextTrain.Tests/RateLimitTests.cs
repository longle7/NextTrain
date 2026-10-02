using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;

namespace NextTrain.Tests;

/// <summary>
/// The per-client rate limit: the client's IP comes from the ingress's X-Forwarded-For, each IP has its own
/// allowance, and the host's health probe is never limited.
/// </summary>
public class RateLimitTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _factory = new WebApplicationFactory<Program>()
        .WithWebHostBuilder(b => b
            .UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString)
            .UseSetting("Stations:RefreshHours", "0")
            .UseSetting("RateLimit:PerMinute", "3"));

    public void Dispose() => _factory.Dispose();

    private static HttpRequestMessage Get(string path, string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        request.Headers.Add("Origin", "capacitor://localhost");
        return request;
    }

    [Fact]
    public async Task OverTheLimit_Returns429ProblemJsonWithRetryAfterAndCors_OnlyForThatClient()
    {
        using var client = _factory.CreateClient();
        for (var i = 0; i < 3; i++)
            Assert.NotEqual(HttpStatusCode.TooManyRequests, (await client.SendAsync(Get("/nope", "203.0.113.1"))).StatusCode);

        var limited = await client.SendAsync(Get("/nope", "203.0.113.1"));

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("Too many requests", (await limited.Content.ReadFromJsonAsync<ProblemDetails>())?.Title);
        Assert.InRange(int.Parse(limited.Headers.GetValues("Retry-After").Single()), 1, 60);
        Assert.Equal("capacitor://localhost", limited.Headers.GetValues("Access-Control-Allow-Origin").Single());

        // Someone else is unaffected.
        Assert.NotEqual(HttpStatusCode.TooManyRequests, (await client.SendAsync(Get("/nope", "203.0.113.2"))).StatusCode);
    }

    [Fact]
    public async Task ClientCantDodgeTheLimit_ByAddingItsOwnForwardedForEntries()
    {
        using var client = _factory.CreateClient();
        // The ingress appends the real IP last; whatever the client put before it is ignored.
        for (var i = 0; i < 3; i++)
            await client.SendAsync(Get("/nope", $"198.51.100.{i}, 203.0.113.9"));

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(Get("/nope", "198.51.100.99, 203.0.113.9"))).StatusCode);
    }

    [Fact]
    public async Task BehindCloudflare_TheClientIsSecondFromTheEnd_AndForgedEntriesStillDontCount()
    {
        using var factory = _factory.WithWebHostBuilder(b => b.UseSetting("Proxy:Hops", "2"));
        using var client = factory.CreateClient();
        // Cloudflare appends the visitor, then Azure's ingress appends Cloudflare: "forged…, visitor, cloudflare".
        for (var i = 0; i < 3; i++)
            await client.SendAsync(Get("/nope", $"198.51.100.{i}, 203.0.113.20, 172.64.0.{i}"));

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(Get("/nope", "198.51.100.99, 203.0.113.20, 172.64.0.9"))).StatusCode);
        Assert.NotEqual(HttpStatusCode.TooManyRequests, (await client.SendAsync(Get("/nope", "203.0.113.21, 172.64.0.9"))).StatusCode);
    }

    [Fact]
    public async Task Health_IsNeverLimited()
    {
        using var client = _factory.CreateClient();
        for (var i = 0; i < 6; i++)
            Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Get("/health", "203.0.113.3"))).StatusCode);
    }
}
