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
    /// A single real-time prediction for a trip at a stop. Timetable entries (MBTA's /schedules) have the same shape, so
    /// they use it too. Only the route relationship is read: a schedule also has list-valued ones ("added_routes").
    /// </summary>
    public class MbtaPredictionDto
    {
        public MbtaPredictionAttributesDto Attributes { get; set; } = new();

        public MbtaPredictionRelationshipsDto Relationships { get; set; } = new();
    }

    public class MbtaPredictionAttributesDto
    {
        // Null at the last stop (nothing departs) and at skipped stops.
        public DateTimeOffset? DepartureTime { get; set; }

        public int DirectionId { get; set; }

        // Schedules only: 1 means no boarding at this stop.
        public int? PickupType { get; set; }
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
