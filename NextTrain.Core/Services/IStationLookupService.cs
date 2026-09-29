using System.Collections.Generic;
using System.Threading.Tasks;
using NextTrain.Core.Domain;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Reads stations from our database. Implemented by StationLookupService (NextTrain.Api).
    /// routeId is optional everywhere: leave it out for all stations, or pass one like "Red" for that line only.
    /// </summary>
    public interface IStationLookupService
    {
        // The closest station to a point, or null if there are no stations (on that route).
        Task<Station?> GetNearestStationAsync(double latitude, double longitude, string? routeId = null);

        // One station by MBTA's ID, e.g. "place-pktrm" for Park Street, or null if unknown.
        Task<Station?> GetByMbtaStopIdAsync(string mbtaStopId);

        // All stations (or one route's), sorted by name.
        Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null);
    }
}