namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents a user's recurring commute configuration for notifications.
    /// </summary>
    public class UserCommute
    {
        // Database ID (primary key).
        public int Id { get; set; }

        // The anonymous ID the app sends as X-User-Id (see CommutesController).
        public string UserId { get; set; } = string.Empty;

        // Station where the user boards (FK to Station.Id).
        public int StationId { get; set; }
        public Station? Station { get; set; }

        // MBTA route/line (e.g., "Red", "Orange").
        public string RouteId { get; set; } = string.Empty;

        // Direction ID (e.g., 0 or 1 based on MBTA API).
        public int DirectionId { get; set; }

        // Commute start time (e.g., 7:45 AM local).
        public TimeSpan WindowStartLocal { get; set; }

        // Commute end time (e.g., 8:15 AM local).
        public TimeSpan WindowEndLocal { get; set; }

        // Days of week this commute is active (e.g., "Mon,Tue,Wed,Thu,Fri").
        public string ActiveDays { get; set; } = "Mon,Tue,Wed,Thu,Fri";

        // Whether notifications are currently enabled.
        public bool IsEnabled { get; set; } = true;

        // Timestamps for auditing.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}