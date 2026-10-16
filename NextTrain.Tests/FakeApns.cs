using NextTrain.Api.Services;

namespace NextTrain.Tests;

/// <summary>
/// In-memory IApnsSender: records what would have gone to Apple, and answers Unregistered for the tokens in Gone.
/// </summary>
public class FakeApns : IApnsSender
{
    public List<(string Token, string Title, string Body)> Sent { get; } = new();
    public List<(string Token, LiveActivityContent Content, bool End)> LiveActivityUpdates { get; } = new();
    public HashSet<string> Gone { get; } = new();
    public bool IsConfigured => true;

    public Task<ApnsResult> SendAsync(string deviceToken, string title, string body, CancellationToken cancellationToken = default)
    {
        Sent.Add((deviceToken, title, body));
        return Task.FromResult(Gone.Contains(deviceToken) ? ApnsResult.Unregistered : ApnsResult.Sent);
    }

    public Task<ApnsResult> UpdateLiveActivityAsync(string activityToken, LiveActivityContent content, bool end, CancellationToken cancellationToken = default)
    {
        LiveActivityUpdates.Add((activityToken, content, end));
        return Task.FromResult(Gone.Contains(activityToken) ? ApnsResult.Unregistered : ApnsResult.Sent);
    }
}
