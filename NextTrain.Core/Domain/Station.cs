namespace NextTrain.Core.Domain
{
    /// <summary>
    /// Represents an MBTA stop/station cached locally in SQL Server.
    /// </summary>
    public class Station
    {
        // Database ID (primary key).
        public int Id { get; set; }

        // MBTA's stop ID (e.g., "place-alwh" for Alewife).
        public string MbtaStopId { get; set; } = string.Empty;

        // Human-readable station name (e.g., "Alewife").
        public string Name { get; set; } = string.Empty;

        // Where the station is, for the map and "Near you".
        public double Latitude { get; set; }
        public double Longitude { get; set; }

        // Optional: route/line info (e.g., "Red Line").
        public string RouteId { get; set; } = string.Empty;

        // Step-free access for wheelchairs, from MBTA. Null when MBTA has no information.
        public bool? IsAccessible { get; set; }

        // Average weekday boardings (all lines), from MBTA's published ridership counts. Null if unknown.
        public int? AverageWeekdayBoardings { get; set; }

        // Timestamps for auditing/cache freshness.
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}