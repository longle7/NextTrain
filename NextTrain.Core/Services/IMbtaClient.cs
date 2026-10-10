namespace NextTrain.Core.Services
{
    /// <summary>
    /// Everything the app needs from the MBTA API. The real implementation is MbtaClient (NextTrain.Api), which
    /// caches each answer. Code depends on this interface rather than MbtaClient, so tests can swap in
    /// FakeMbtaClient and never call the real MBTA.
    /// </summary>
    public interface IMbtaClient
    {
        // Gets the stops served by a single route (e.g., "Red"), in the order its vehicles visit them. With a
        // direction, only that direction's: a bus route's two directions mostly use different stops (each side of
        // the street). Stops inside a station come back as the station (e.g., "place-sstat").
        // MBTA only populates the stop's route relationship when filtering by one route.
        Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId, int? directionId = null);

        // Gets predictions at a station (parent IDs like "place-pktrm" include all platforms)
        // for a comma-separated list of routes (e.g., "Orange,Red").
        Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds);

        // Gets the timetable's departures at a station over the next few hours for the given routes, soonest first.
        Task<IReadOnlyList<MbtaScheduledDeparture>> GetSchedulesAsync(string mbtaStopId, string routeIds);

        // Gets subway routes (types 0 and 1) with colors and direction names, in MBTA sort order.
        Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync();

        // Gets bus routes (type 3), Silver Line first, in MBTA sort order.
        Task<IReadOnlyList<MbtaRouteDto>> GetBusRoutesAsync();

        // Gets live positions of subway trains that report a location.
        Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync();

        // Gets live positions of the given routes' vehicles (comma-separated route IDs), e.g. one bus route's buses.
        Task<IReadOnlyList<MbtaVehicle>> GetRouteVehiclesAsync(string routeIds);

        // Gets the track shape of each subway route's typical trips.
        Task<IReadOnlyList<MbtaShape>> GetSubwayShapesAsync();

        // Gets the shapes of one route's typical trips, both directions (a bus can take different streets each way).
        Task<IReadOnlyList<MbtaShape>> GetRouteShapesAsync(string routeId);

        // Gets subway service alerts in effect right now (delays, suspensions, station closures, ...).
        Task<IReadOnlyList<MbtaAlertDto>> GetSubwayAlertsAsync();

        // Gets alerts in effect right now for the given routes (comma-separated route IDs), e.g. bus detours.
        Task<IReadOnlyList<MbtaAlertDto>> GetRouteAlertsAsync(string routeIds);
    }
}
