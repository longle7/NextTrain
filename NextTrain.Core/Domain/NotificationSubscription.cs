namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents a push-notification subscription (web push or native device token).
    /// </summary>
    public class NotificationSubscription
    {
        // Database ID (primary key).
        public int Id { get; set; }

        // Foreign key to identify the user.
        public string UserId { get; set; } = string.Empty;

        // Type of subscription (e.g., "WebPush", "Apns").
        public string SubscriptionType { get; set; } = "WebPush";

        // For WebPush: endpoint URL; for APNs: device token.
        public string EndpointOrToken { get; set; } = string.Empty;

        // For WebPush: P256DH public key.
        public string? PublicKey { get; set; }

        // For WebPush: auth secret.
        public string? AuthSecret { get; set; }

        // When this subscription was created/updated.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }

        // Whether this subscription is currently active.
        public bool IsActive { get; set; } = true;
    }
}