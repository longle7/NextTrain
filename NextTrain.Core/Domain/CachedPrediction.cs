namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents a cached real-time prediction for a specific station and route.
    /// </summary>
    public class CachedPrediction
    {
        // Primary key for your own database.
        public int Id { get; set; }

        // Foreign key to Station.Id.
        public int StationId { get; set; }

        // Navigation property (optional but useful with EF Core).
        public Station? Station { get; set; }

        // MBTA route ID (e.g., "Red", "Orange").
        public string RouteId { get; set; } = string.Empty;

        // MBTA direction ID (0 = one way, 1 = the other).
        public int DirectionId { get; set; }

        // MBTA trip ID (optional).
        public string? TripId { get; set; }

        // MBTA vehicle ID (optional, used to link to vehicle details).
        public string? VehicleId { get; set; }

        // When MBTA says the train will arrive at this station.
        public DateTime? ArrivalTimeUtc { get; set; }

        // When MBTA says the train will depart from this station.
        public DateTime? DepartureTimeUtc { get; set; }

        // The occupancy/busyness (optional; MBTA can provide occupancy in predictions/vehicles).
        public string? OccupancyStatus { get; set; }

        // When this prediction was last updated from MBTA.
        public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;

        // Convenience: computed minutes until arrival, based on ArrivalTimeUtc.
        public double? MinutesUntilArrival =>
            ArrivalTimeUtc.HasValue
                ? (ArrivalTimeUtc.Value - DateTime.UtcNow).TotalMinutes
                : null;
    }
}