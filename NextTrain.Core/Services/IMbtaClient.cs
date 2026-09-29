namespace NextTrain.Core.Services
{
    /// <summary>
    /// Everything the app needs from the MBTA API. The real implementation is MbtaClient (NextTrain.Api), which
    /// caches each answer. Code depends on this interface rather than MbtaClient, so tests can swap in
    /// FakeMbtaClient and never call the real MBTA.
    /// </summary>
    public interface IMbtaClient
    {
        // Gets the stops served by a single route (e.g., "Red").
        // MBTA only populates the stop's route relationship when filtering by one route.
        Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId);

        // Gets predictions at a station (parent IDs like "place-pktrm" include all platforms)
        // for a comma-separated list of routes (e.g., "Orange,Red").
        Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds);

        // Gets subway routes (types 0 and 1) with colors and direction names, in MBTA sort order.
        Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync();

        // Gets live positions of subway trains that report a location.
        Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync();

        // Gets the track shape of each subway route's typical trips.
        Task<IReadOnlyList<MbtaShape>> GetSubwayShapesAsync();

        // Gets subway service alerts in effect right now (delays, suspensions, station closures, ...).
        Task<IReadOnlyList<MbtaAlertDto>> GetSubwayAlertsAsync();
    }
}
