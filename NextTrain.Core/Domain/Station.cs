namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents an MBTA stop/station cached locally in SQL Server.
    /// </summary>
    public class Station
    {
        // Primary key for your own database.
        public int Id { get; set; }

        // MBTA's stop ID (e.g., "place-alwh" for Alewife).
        public string MbtaStopId { get; set; } = string.Empty;

        // Human-readable station name (e.g., "Alewife").
        public string Name { get; set; } = string.Empty;

        // Latitude and longitude for geolocation / nearest-station queries.
        public double Latitude { get; set; }
        public double Longitude { get; set; }

        // Optional: route/line info (e.g., "Red Line").
        public string RouteId { get; set; } = string.Empty;

        // Optional: direction info or platform grouping.
        public string? PlatformCode { get; set; }

        // Step-free access for wheelchairs, from MBTA. Null when MBTA has no information.
        public bool? IsAccessible { get; set; }

        // Average weekday boardings (all lines), from MBTA's published ridership counts. Null if unknown.
        public int? AverageWeekdayBoardings { get; set; }

        // Timestamps for auditing/cache freshness.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}