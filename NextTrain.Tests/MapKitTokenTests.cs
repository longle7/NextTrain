using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using NextTrain.Api.Controllers;

namespace NextTrain.Tests;

/// <summary>
/// GET /mapkit/token: signed so Apple accepts it, and only handed to the app's own origins.
/// Uses a throwaway P-256 key in place of the real .p8 from Apple.
/// </summary>
public class MapKitTokenTests : IDisposable
{
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly WebApplicationFactory<Program> _factory;

    public MapKitTokenTests()
    {
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Production") // Development would allow calls without an Origin
            .UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString)
            .UseSetting("Stations:RefreshHours", "0")
            .UseSetting("MapKit:TeamId", "TEAM123456")
            .UseSetting("MapKit:KeyId", "KEY1234567")
            .UseSetting("MapKit:PrivateKey", _key.ExportPkcs8PrivateKeyPem()));
    }

    public void Dispose()
    {
        _factory.Dispose();
        _key.Dispose();
    }

    [Fact]
    public async Task Token_IsAnES256JwtForTheCallingOrigin_ThatVerifiesWithTheKey()
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "capacitor://localhost");

        var response = await client.GetAsync("/mapkit/token");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        var parts = (await response.Content.ReadAsStringAsync()).Split('.');
        Assert.Equal(3, parts.Length);

        using var header = JsonDocument.Parse(FromBase64Url(parts[0]));
        Assert.Equal("ES256", header.RootElement.GetProperty("alg").GetString());
        Assert.Equal("KEY1234567", header.RootElement.GetProperty("kid").GetString());

        using var payload = JsonDocument.Parse(FromBase64Url(parts[1]));
        Assert.Equal("TEAM123456", payload.RootElement.GetProperty("iss").GetString());
        Assert.Equal("capacitor://localhost", payload.RootElement.GetProperty("origin").GetString());
        var lifetime = payload.RootElement.GetProperty("exp").GetInt64() - payload.RootElement.GetProperty("iat").GetInt64();
        Assert.Equal((long)MapKitController.TokenLifetime.TotalSeconds, lifetime);

        Assert.True(_key.VerifyData(Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]), FromBase64Url(parts[2]), HashAlgorithmName.SHA256));
    }

    [Fact]
    public async Task Token_IsRefused_ForOtherSites_AndWithoutAnOrigin()
    {
        using var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/mapkit/token")).StatusCode);

        client.DefaultRequestHeaders.Add("Origin", "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/mapkit/token")).StatusCode);
    }

    [Fact]
    public async Task Token_Is404_UntilMapKitIsConfigured()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseSetting("ConnectionStrings:DefaultConnection", TestDb.ConnectionString)
            .UseSetting("Stations:RefreshHours", "0"));
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "capacitor://localhost");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/mapkit/token")).StatusCode);
    }

    private static byte[] FromBase64Url(string s) =>
        Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/').PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
}
