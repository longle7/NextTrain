using System;
using System.Collections.Generic;
using System.Text;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Absraction over the MBTA API
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
    }
}
