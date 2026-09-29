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
    }

    /// <summary>
    /// Attributes of a stop, including name and location.
    /// </summary>
    public class MbtaStopAttributesDto
    {
        public string Name { get; set; } = string.Empty;

        // Nullable: some MBTA stops have no coordinates; the import skips them.
        public double? Latitude { get; set; }

        public double? Longitude { get; set; }

        // Optional: platform code, type, etc.
        public string? PlatformCode { get; set; }

        // 1 = accessible, 2 = not accessible, 0 or missing = no information.
        public int? WheelchairBoarding { get; set; }
    }
}
