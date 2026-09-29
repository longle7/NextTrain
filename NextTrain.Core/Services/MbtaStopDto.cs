using System.Collections.Generic;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Top-level MBTA stops response.
    /// </summary>
    public class MbtaStopsResponseDto
    {
        public List<MbtaStopDto> Data { get; set; } = new();
    }

    /// <summary>
    /// Represents a single stop item in the MBTA API response.
    /// </summary>
    public class MbtaStopDto
    {
        public string Id { get; set; } = string.Empty; // MBTA stop ID (e.g., "place-alwh")

        public MbtaStopAttributesDto Attributes { get; set; } = new();

        public MbtaStopRelationshipsDto? Relationships { get; set; }
    }

    /// <summary>
    /// Attributes of a stop, including name and location.
    /// </summary>
    public class MbtaStopAttributesDto
    {
        public string Name { get; set; } = string.Empty;

        // TODO: Need to filter out stations with null values for lat and long
        public double? Latitude { get; set; }

        public double? Longitude { get; set; }

        // Optional: platform code, type, etc.
        public string? PlatformCode { get; set; }
    }

    /// <summary>
    /// Relationships (e.g., routes serving this stop).
    /// </summary>
    public class MbtaStopRelationshipsDto
    {
        public MbtaRouteRelationDto? Route { get; set; }
    }

    public class MbtaRouteRelationDto
    {
        public MbtaRouteDataDto? Data { get; set; }
    }

    public class MbtaRouteDataDto
    {
        public string Id { get; set; } = string.Empty; // Route ID, e.g., "Red"
    }
}