namespace NextTrain.Core.Domain
{
    /// <summary>
    /// A phone that gets delay notifications: its Apple push token, under the anonymous user ID its commutes use.
    /// One per user ID: each install of the app makes its own ID.
    /// </summary>
    public class PushDevice
    {
        public int Id { get; set; }

        public string UserId { get; set; } = string.Empty;

        // Apple's device token (hex), what a notification is addressed to.
        public string Token { get; set; } = string.Empty;

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// A commute's Live Activity on a phone's Lock Screen, which the API keeps up to date while the app is closed
    /// (LiveActivityUpdater): the push token iOS gave it, and when the commute window ends. One per user ID: the app
    /// shows one commute at a time.
    /// </summary>
    public class LiveActivityToken
    {
        public int Id { get; set; }

        public string UserId { get; set; } = string.Empty;

        public int CommuteId { get; set; }

        public string Token { get; set; } = string.Empty;

        public DateTime EndsAtUtc { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// A delay notification already sent: each alert reaches each user once, even across restarts. Kept a few days.
    /// </summary>
    public class SentNotification
    {
        public int Id { get; set; }

        public string UserId { get; set; } = string.Empty;

        public string AlertId { get; set; } = string.Empty;

        public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
    }
}
