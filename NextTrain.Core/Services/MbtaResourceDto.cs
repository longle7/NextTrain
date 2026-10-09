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
        public List<MbtaCarriageDto>? Carriages { get; set; }  // the train's cars, front to back
        public string? OccupancyStatus { get; set; }           // a bus's crowding (buses report it for the whole vehicle)
        public int? OccupancyPercentage { get; set; }

        // Route pattern
        public int? Typicality { get; set; }   // 1 typical; 2-4 deviations, detours, short trips

        // Stop
        public string? Name { get; set; }

        // Shape: Google encoded polyline
        public string? Polyline { get; set; }
    }

    // How full one car is. Only some trains report it (today: Orange, and the newer Red Line cars); the rest send
    // "NO_DATA_AVAILABLE".
    public class MbtaCarriageDto
    {
        public string? OccupancyStatus { get; set; }   // "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", ...
        public int? OccupancyPercentage { get; set; }  // 0-100
    }

    // A train's live position. StopName is the stop it's at or heading to; StationId is that stop's
    // parent station (e.g. "place-shmnl"), which is what stations are keyed by. Cars lists each car's crowding
    // (null when not reported).
    public record MbtaVehicle(
        string Id, string RouteId, int DirectionId, double Latitude, double Longitude,
        int? Bearing, string? CurrentStatus, string? StopName, string? StationId, IReadOnlyList<MbtaCar> Cars);

    public record MbtaCar(string? Crowding, int? PercentFull);

    // The track a route runs on, as a Google encoded polyline. Red has two (Ashmont and Braintree branches).
    public record MbtaShape(string RouteId, string Polyline);
}
