using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Reads stations from the database (StationImportService puts them there). Controllers go through this
    /// service instead of the DbContext so every station query lives in one place.
    /// </summary>
    public class StationLookupService
    {
        private readonly NextTrainDbContext _dbContext;

        public StationLookupService(NextTrainDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public Task<Station?> GetByMbtaStopIdAsync(string mbtaStopId) =>
            _dbContext.Stations.FirstOrDefaultAsync(s => s.MbtaStopId == mbtaStopId);

        // Every subway station, or every stop on one route (subway or bus; with a direction, only that direction's), A-Z.
        public async Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null, int? directionId = null) =>
            await ServingRoute(routeId, directionId).OrderBy(s => s.Name).ToListAsync();

        // Bus stops that aren't subway stations, A-Z. (Subway stations buses stop at come with the subway ones.)
        public async Task<IReadOnlyList<Station>> GetBusStopsAsync() =>
            await _dbContext.Stations.Where(s => s.RouteId == "").OrderBy(s => s.Name).ToListAsync();

        // No route: subway stations only, which is what older app versions expect. A route: the stops it serves.
        // This builds a database query; nothing runs until ToListAsync.
        // A transfer station's RouteId lists all its lines ("Orange,Red"), so we match whole entries by wrapping in
        // commas: ",Orange,Red," contains ",Red,", but ",Green-B,Red," does not contain ",Green,". BusRoutes holds
        // "route:direction" pairs, so ",1:" finds route 1 (not 10) and ",1:0" one direction.
        private IQueryable<Station> ServingRoute(string? routeId, int? directionId)
        {
            if (string.IsNullOrWhiteSpace(routeId)) return _dbContext.Stations.Where(s => s.RouteId != "");
            var subway = "," + routeId + ",";
            var bus = "," + routeId + ":" + directionId;
            return _dbContext.Stations.Where(s => ("," + s.RouteId + ",").Contains(subway) || ("," + s.BusRoutes).Contains(bus));
        }
    }
}
