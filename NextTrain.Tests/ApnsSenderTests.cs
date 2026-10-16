using System.Buffers.Text;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NextTrain.Api.Services;

namespace NextTrain.Tests;

/// <summary>
/// ApnsSender: what goes to Apple, and how Apple's answers are read. Apple is replaced by a handler that records each
/// request and answers as told; a throwaway P-256 key stands in for the real .p8.
/// </summary>
public class ApnsSenderTests : IDisposable
{
    private static readonly string Token = new('a', 64);
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly FakeApple _apple = new();

    private class FakeApple : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Requests { get; } = new();
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        public string? Reason { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add((request, await request.Content!.ReadAsStringAsync(cancellationToken)));
            return new HttpResponseMessage(Status) { Content = new StringContent(Reason is null ? "" : $$"""{"reason":"{{Reason}}"}""") };
        }
    }

    private ApnsSender Sender(bool configured = true) => new(
        new HttpClient(_apple),
        new ConfigurationBuilder().AddInMemoryCollection(configured
            ? new Dictionary<string, string?>
            {
                ["MapKit:TeamId"] = "TEAM123456",
                ["Apns:KeyId"] = "PUSHKEY123",
                ["Apns:PrivateKey"] = _key.ExportPkcs8PrivateKeyPem(),
            }
            : []).Build(),
        NullLogger<ApnsSender>.Instance);

    public void Dispose() => _key.Dispose();

    [Fact]
    public async Task Send_PostsTheAlertToApple_SignedWithTheKey()
    {
        var result = await Sender().SendAsync(Token, "Red Line suspension", "Shuttle buses replace Red Line trains.");

        Assert.Equal(ApnsResult.Sent, result);
        var (request, body) = Assert.Single(_apple.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal($"https://api.push.apple.com/3/device/{Token}", request.RequestUri!.ToString());
        Assert.Equal(HttpVersion.Version20, request.Version);
        Assert.Equal("com.longledev.nexttrain", request.Headers.GetValues("apns-topic").Single());
        Assert.Equal("alert", request.Headers.GetValues("apns-push-type").Single());

        using var json = JsonDocument.Parse(body);
        var alert = json.RootElement.GetProperty("aps").GetProperty("alert");
        Assert.Equal("Red Line suspension", alert.GetProperty("title").GetString());
        Assert.Equal("Shuttle buses replace Red Line trains.", alert.GetProperty("body").GetString());

        // "bearer <ES256 JWT>": our team, our key's ID, and a signature the key verifies.
        var jwt = request.Headers.GetValues("authorization").Single()["bearer ".Length..].Split('.');
        using var header = JsonDocument.Parse(Base64Url.DecodeFromChars(jwt[0]));
        Assert.Equal("PUSHKEY123", header.RootElement.GetProperty("kid").GetString());
        using var claims = JsonDocument.Parse(Base64Url.DecodeFromChars(jwt[1]));
        Assert.Equal("TEAM123456", claims.RootElement.GetProperty("iss").GetString());
        Assert.True(_key.VerifyData(Encoding.ASCII.GetBytes(jwt[0] + "." + jwt[1]), Base64Url.DecodeFromChars(jwt[2]), HashAlgorithmName.SHA256));
    }

    [Fact]
    public async Task ALiveActivityUpdate_GoesToItsTopic_WithTheContentStateTheAppDecodes()
    {
        var staleAt = DateTimeOffset.UtcNow.AddMinutes(3);
        var endsAt = DateTimeOffset.UtcNow.AddMinutes(20);
        var result = await Sender().UpdateLiveActivityAsync(Token, new LiveActivityContent([1760270580, 1760270940], "Red Line delay", staleAt, endsAt), end: false);

        Assert.Equal(ApnsResult.Sent, result);
        var (request, body) = Assert.Single(_apple.Requests);
        Assert.Equal("com.longledev.nexttrain.push-type.liveactivity", request.Headers.GetValues("apns-topic").Single());
        Assert.Equal("liveactivity", request.Headers.GetValues("apns-push-type").Single());
        Assert.Equal("5", request.Headers.GetValues("apns-priority").Single());
        using var json = JsonDocument.Parse(body);
        var aps = json.RootElement.GetProperty("aps");
        Assert.Equal("update", aps.GetProperty("event").GetString());
        Assert.Equal(staleAt.ToUnixTimeSeconds(), aps.GetProperty("stale-date").GetInt64());
        var state = aps.GetProperty("content-state");
        Assert.Equal([1760270580L, 1760270940L], state.GetProperty("departures").EnumerateArray().Select(d => d.GetInt64()));
        Assert.Equal("Red Line delay", state.GetProperty("alert").GetString());
        Assert.Equal(endsAt.ToUnixTimeSeconds(), state.GetProperty("endsAt").GetInt64());
    }

    [Fact]
    public async Task EndingALiveActivity_DismissesIt_AndLeavesOutAMissingAlert()
    {
        await Sender().UpdateLiveActivityAsync(Token, new LiveActivityContent([], null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow), end: true);

        using var json = JsonDocument.Parse(Assert.Single(_apple.Requests).Body);
        var aps = json.RootElement.GetProperty("aps");
        Assert.Equal("end", aps.GetProperty("event").GetString());
        Assert.True(aps.TryGetProperty("dismissal-date", out _));
        Assert.False(aps.GetProperty("content-state").TryGetProperty("alert", out _));
    }

    [Fact]
    public async Task TheSignedToken_IsReused()
    {
        var sender = Sender();

        await sender.SendAsync(Token, "One", "First.");
        await sender.SendAsync(Token, "Two", "Second.");

        Assert.Single(_apple.Requests.Select(r => r.Request.Headers.GetValues("authorization").Single()).Distinct());
    }

    [Theory]
    [InlineData(HttpStatusCode.Gone, "Unregistered", ApnsResult.Unregistered)]
    [InlineData(HttpStatusCode.BadRequest, "BadDeviceToken", ApnsResult.Unregistered)]
    [InlineData(HttpStatusCode.BadRequest, "DeviceTokenNotForTopic", ApnsResult.Unregistered)]
    [InlineData(HttpStatusCode.Forbidden, "InvalidProviderToken", ApnsResult.Failed)]
    [InlineData(HttpStatusCode.ServiceUnavailable, null, ApnsResult.Failed)]
    public async Task ApplesRefusal_SaysWhetherToKeepTheToken(HttpStatusCode status, string? reason, ApnsResult expected)
    {
        _apple.Status = status;
        _apple.Reason = reason;

        Assert.Equal(expected, await Sender().SendAsync(Token, "Title", "Body."));
    }

    [Fact]
    public void WithoutAKey_ItIsOff() => Assert.False(Sender(configured: false).IsConfigured);
}
