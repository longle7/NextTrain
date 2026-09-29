namespace NextTrain.Core.Services
{
    /// <summary>
    /// Top-level MBTA alerts response.
    /// </summary>
    public class MbtaAlertsResponseDto
    {
        public List<MbtaAlertDto> Data { get; set; } = new();
    }

    /// <summary>
    /// A service alert: a delay, suspension, station closure, etc.
    /// </summary>
    public class MbtaAlertDto
    {
        public string Id { get; set; } = string.Empty;

        public MbtaAlertAttributesDto Attributes { get; set; } = new();
    }

    public class MbtaAlertAttributesDto
    {
        public string Effect { get; set; } = string.Empty;        // "SUSPENSION", "DELAY", "STATION_CLOSURE", ...

        public int Severity { get; set; }                          // 0 (info) to 10 (worst)

        public string Header { get; set; } = string.Empty;        // one or two sentences

        public string? Description { get; set; }                   // longer detail, plain text with blank lines

        public string? ServiceEffect { get; set; }                 // short summary, e.g. "Symphony closed"

        public string? Timeframe { get; set; }                     // e.g. "through Sunday", "ongoing"

        public string? Url { get; set; }

        // Which routes, stops (parent stations and platforms), and directions the alert covers.
        public List<MbtaInformedEntityDto> InformedEntity { get; set; } = new();
    }

    public class MbtaInformedEntityDto
    {
        public string? Route { get; set; }

        public string? Stop { get; set; }

        public int? DirectionId { get; set; }
    }
}
