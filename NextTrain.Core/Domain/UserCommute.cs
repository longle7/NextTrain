namespace NextTrain.Core.Domain
{
    /// <summary>
    /// A commute a user saved: where they board, which way, and when. Home shows its next trains while it's on.
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

        // An optional change partway (e.g. off the Green Line onto the Blue Line at Government Center): where, onto
        // which route and direction, and how many minutes the rider needs to get from one platform to the other.
        // All null when the commute is one ride.
        public int? TransferStationId { get; set; }
        public Station? TransferStation { get; set; }
        public string? TransferRouteId { get; set; }
        public int? TransferDirectionId { get; set; }
        public int? TransferMinutes { get; set; }

        // Where the rider gets off the first ride when the change is a short walk to another stop: off the 66 at
        // Tremont St opp Roxbury Crossing Sta, a minute's walk to the 22 at Columbus Ave @ Malcolm X Blvd. Null when
        // they change at TransferStation itself (the same station or stop), as every commute before this did.
        public int? TransferFromStationId { get; set; }
        public Station? TransferFromStation { get; set; }

        // Commute start time (e.g., 7:45 AM local).
        public TimeSpan WindowStartLocal { get; set; }

        // Commute end time (e.g., 8:15 AM local).
        public TimeSpan WindowEndLocal { get; set; }

        // Days of week this commute is active (e.g., "Mon,Tue,Wed,Thu,Fri").
        public string ActiveDays { get; set; } = "Mon,Tue,Wed,Thu,Fri";

        // Timestamps for auditing.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}