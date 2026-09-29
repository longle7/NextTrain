namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents the latest known status for a vehicle (train or bus).
    /// </summary>
    public class VehicleStatus
    {
        public int Id { get; set; }

        // MBTA vehicle ID.
        public string VehicleId { get; set; } = string.Empty;

        // MBTA route and direction.
        public string RouteId { get; set; } = string.Empty;
        public int DirectionId { get; set; }

        // Current location.
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }

        // Optional fields you may use later.
        public string? CurrentStatus { get; set; }    // "IN_TRANSIT_TO", "STOPPED_AT", etc.
        public string? OccupancyStatus { get; set; }  // "MANY_SEATS_AVAILABLE", etc.

        // Timestamp of the last update from MBTA.
        public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;
    }
}