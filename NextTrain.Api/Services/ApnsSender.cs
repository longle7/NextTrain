using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace NextTrain.Api.Services
{
    public enum ApnsResult
    {
        Sent,
        Unregistered, // the app was deleted, or the token is bad: stop sending to it
        Failed,
    }

    public interface IApnsSender
    {
        // False until the APNs key is configured; nothing is sent until then.
        bool IsConfigured { get; }

        Task<ApnsResult> SendAsync(string deviceToken, string title, string body, CancellationToken cancellationToken = default);

        // Updates a Live Activity (new departures, alert), or ends it when `end` is true.
        Task<ApnsResult> UpdateLiveActivityAsync(string activityToken, LiveActivityContent content, bool end, CancellationToken cancellationToken = default);
    }

    // A Live Activity's content-state: what CommuteActivityAttributes.ContentState decodes (departures in Unix seconds,
    // soonest first, the worst alert, and the end of the commute window), and when it goes stale: when the next train
    // leaves, so iOS redraws it and the countdown moves on, or the end of the window.
    public record LiveActivityContent(IReadOnlyList<long> Departures, string? Alert, DateTimeOffset StaleAt, DateTimeOffset EndsAt);

    /// <summary>
    /// Sends notifications through Apple's push service (APNs) over HTTP/2, authenticated with a token signed by our
    /// APNs key. Settings (from the Apple Developer account): Apns:KeyId and Apns:PrivateKey (the .p8 file's contents),
    /// with Apns:TeamId (or MapKit:TeamId) and Apns:BundleId. TestFlight and App Store builds use the production service.
    /// One instance for the whole app: Apple wants the same token reused, refreshed no more than every 20 minutes.
    /// </summary>
    public class ApnsSender : IApnsSender
    {
        public static readonly TimeSpan TokenReuse = TimeSpan.FromMinutes(50); // Apple accepts a token for up to an hour

        private readonly HttpClient _http;
        private readonly ILogger<ApnsSender> _logger;
        private readonly string? _teamId, _keyId, _privateKey;
        private readonly string _topic;
        private (string Value, DateTimeOffset At)? _token;

        public ApnsSender(HttpClient http, IConfiguration config, ILogger<ApnsSender> logger)
        {
            _http = http;
            _logger = logger;
            _teamId = config["Apns:TeamId"] ?? config["MapKit:TeamId"];
            _keyId = config["Apns:KeyId"];
            _privateKey = config["Apns:PrivateKey"];
            _topic = config["Apns:BundleId"] ?? "com.longledev.nexttrain";
        }

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(_teamId) && !string.IsNullOrWhiteSpace(_keyId) && !string.IsNullOrWhiteSpace(_privateKey);

        public Task<ApnsResult> SendAsync(string deviceToken, string title, string body, CancellationToken cancellationToken = default)
        {
            var now = DateTimeOffset.UtcNow;
            // A delay notice is pointless later: Apple drops it if the phone stays unreachable for an hour.
            return PostAsync(deviceToken, _topic, "alert", priority: 10, expires: now.AddHours(1), now,
                new { aps = new { alert = new { title, body }, sound = "default" } }, cancellationToken);
        }

        // Priority 5: Apple delivers it soon, without counting against the app's budget of urgent updates. Expires in
        // two minutes, since the next minute brings fresher times. Ending dismisses it from the Lock Screen a minute later.
        public Task<ApnsResult> UpdateLiveActivityAsync(string activityToken, LiveActivityContent content, bool end, CancellationToken cancellationToken = default)
        {
            var now = DateTimeOffset.UtcNow;
            var aps = new Dictionary<string, object?>
            {
                ["timestamp"] = now.ToUnixTimeSeconds(),
                ["event"] = end ? "end" : "update",
                ["content-state"] = State(content),
                [end ? "dismissal-date" : "stale-date"] = end ? now.AddMinutes(1).ToUnixTimeSeconds() : content.StaleAt.ToUnixTimeSeconds(),
            };
            return PostAsync(activityToken, $"{_topic}.push-type.liveactivity", "liveactivity", priority: 5, expires: now.AddMinutes(2), now,
                new { aps }, cancellationToken);
        }

        // CommuteActivityAttributes.ContentState: departures (Unix seconds, soonest first), when the commute window ends
        // (the app then says the commute is over), and the worst alert, if any.
        private static Dictionary<string, object> State(LiveActivityContent content)
        {
            var state = new Dictionary<string, object> { ["departures"] = content.Departures, ["endsAt"] = content.EndsAt.ToUnixTimeSeconds() };
            if (content.Alert is not null) state["alert"] = content.Alert;
            return state;
        }

        private async Task<ApnsResult> PostAsync(string deviceToken, string topic, string pushType, int priority, DateTimeOffset expires,
            DateTimeOffset now, object payload, CancellationToken cancellationToken)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.push.apple.com/3/device/{deviceToken}")
            {
                Version = HttpVersion.Version20,
                VersionPolicy = HttpVersionPolicy.RequestVersionExact,
                Content = JsonContent.Create(payload),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("bearer", Token(now));
            request.Headers.Add("apns-topic", topic);
            request.Headers.Add("apns-push-type", pushType);
            request.Headers.Add("apns-priority", priority.ToString());
            request.Headers.Add("apns-expiration", expires.ToUnixTimeSeconds().ToString());

            using var response = await _http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode) return ApnsResult.Sent;

            var reason = await Reason(response, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Gone || reason is "BadDeviceToken" or "Unregistered" or "DeviceTokenNotForTopic")
            {
                return ApnsResult.Unregistered;
            }
            _logger.LogWarning("Apple's push service refused a notification: {Status} {Reason}", (int)response.StatusCode, reason);
            return ApnsResult.Failed;
        }

        private string Token(DateTimeOffset now)
        {
            if (_token is { } token && now - token.At < TokenReuse) return token.Value;
            var value = AppleJwt.Create(_keyId!, _privateKey!, new Dictionary<string, object> { ["iss"] = _teamId!, ["iat"] = now.ToUnixTimeSeconds() });
            _token = (value, now);
            return value;
        }

        // Apple explains a refusal as {"reason": "BadDeviceToken"}.
        private static async Task<string?> Reason(HttpResponseMessage response, CancellationToken cancellationToken)
        {
            try
            {
                using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
                return json.RootElement.TryGetProperty("reason", out var reason) ? reason.GetString() : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }
}
