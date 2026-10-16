namespace NextTrain.Core.Services
{
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
        // Null where the trip starts (nothing arrives); a transfer uses it to know when a train reaches the station.
        public DateTimeOffset? ArrivalTime { get; set; }

        // Null at the last stop (nothing departs) and at skipped stops.
        public DateTimeOffset? DepartureTime { get; set; }

        public int DirectionId { get; set; }

        // Schedules only: 1 means no boarding at this stop.
        public int? PickupType { get; set; }
    }

    public class MbtaPredictionRelationshipsDto
    {
        public MbtaRelationshipDto Route { get; set; } = new();

        // The trip (one run of one train): the same trip's prediction at a later stop says when it gets there.
        public MbtaRelationshipDto Trip { get; set; } = new();
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
