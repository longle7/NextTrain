using System.Collections.Generic;
using System.Threading.Tasks;
using NextTrain.Core.Domain;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Provides ways to look up stations (nearest, by ID, list, etc.).
    /// </summary>
    public interface IStationLookupService
    {
        Task<Station?> GetNearestStationAsync(double latitude, double longitude, string? routeId = null);

        Task<Station?> GetByMbtaStopIdAsync(string mbtaStopId);

        Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null);
    }
}