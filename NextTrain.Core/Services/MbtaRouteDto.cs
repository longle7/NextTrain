namespace NextTrain.Core.Services
{
    /// <summary>
    /// Top-level MBTA routes response.
    /// </summary>
    public class MbtaRoutesResponseDto
    {
        public List<MbtaRouteDto> Data { get; set; } = new();
    }

    /// <summary>
    /// A route (line), e.g., "Red".
    /// </summary>
    public class MbtaRouteDto
    {
        public string Id { get; set; } = string.Empty;

        public MbtaRouteAttributesDto Attributes { get; set; } = new();
    }

    public class MbtaRouteAttributesDto
    {
        public string LongName { get; set; } = string.Empty;   // "Red Line"

        public string Color { get; set; } = string.Empty;      // hex without '#', e.g., "DA291C"

        public string TextColor { get; set; } = string.Empty;

        // Indexed by direction ID: e.g., ["South", "North"] and ["Ashmont/Braintree", "Alewife"].
        public List<string> DirectionNames { get; set; } = new();

        public List<string> DirectionDestinations { get; set; } = new();

        public int SortOrder { get; set; }
    }
}
