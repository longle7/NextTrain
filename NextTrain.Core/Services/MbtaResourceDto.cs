namespace NextTrain.Core.Services
{
    /// <summary>
    /// An MBTA response that uses `include`: related resources (stops, trips, shapes) arrive in Included.
    /// </summary>
    public class MbtaIncludeResponseDto
    {
        public List<MbtaResourceDto> Data { get; set; } = new();

        public List<MbtaResourceDto> Included { get; set; } = new();
    }

    /// <summary>
    /// Any MBTA resource (vehicle, stop, trip, shape); only the attributes each type has are set.
    /// </summary>
    public class MbtaResourceDto
    {
        public string Id { get; set; } = string.Empty;

        public string Type { get; set; } = string.Empty;

        public MbtaResourceAttributesDto Attributes { get; set; } = new();

        // e.g., "route", "stop", "shape". A relationship's Data is null when it's empty (a vehicle between trips).
        public Dictionary<string, MbtaRelationshipDto?> Relationships { get; set; } = new();

        public string? RelatedId(string name) => Relationships.GetValueOrDefault(name)?.Data?.Id;
    }

    public class MbtaResourceAttributesDto
    {
        // Vehicle
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public int? Bearing { get; set; }          // degrees clockwise from north
        public int DirectionId { get; set; }
        public string? CurrentStatus { get; set; } // "INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"

        // Stop
        public string? Name { get; set; }

        // Shape: Google encoded polyline
        public string? Polyline { get; set; }
    }

    // A train's live position. StopName is the stop it's at or heading to; StationId is that stop's
    // parent station (e.g. "place-shmnl"), which is what stations are keyed by.
    public record MbtaVehicle(
        string Id, string RouteId, int DirectionId, double Latitude, double Longitude,
        int? Bearing, string? CurrentStatus, string? StopName, string? StationId);

    // The track a route runs on, as a Google encoded polyline. Red has two (Ashmont and Braintree branches).
    public record MbtaShape(string RouteId, string Polyline);
}
