namespace NextTrain.Core.Services
{
    /// <summary>
    /// Top-level MBTA predictions response.
    /// </summary>
    public class MbtaPredictionsResponseDto
    {
        public List<MbtaPredictionDto> Data { get; set; } = new();
    }

    /// <summary>
    /// A single real-time prediction for a trip at a stop.
    /// </summary>
    public class MbtaPredictionDto
    {
        public MbtaPredictionAttributesDto Attributes { get; set; } = new();

        public MbtaPredictionRelationshipsDto Relationships { get; set; } = new();
    }

    public class MbtaPredictionAttributesDto
    {
        // Null at the first stop (no arrival) or last stop (no departure).
        public DateTimeOffset? ArrivalTime { get; set; }

        public DateTimeOffset? DepartureTime { get; set; }

        public int DirectionId { get; set; }

        // e.g., "Stopped at station", "Approaching". Often null.
        public string? Status { get; set; }
    }

    public class MbtaPredictionRelationshipsDto
    {
        public MbtaRelationshipDto Route { get; set; } = new();
    }

    public class MbtaRelationshipDto
    {
        public MbtaResourceIdDto Data { get; set; } = new();
    }

    public class MbtaResourceIdDto
    {
        public string Id { get; set; } = string.Empty;
    }
}
