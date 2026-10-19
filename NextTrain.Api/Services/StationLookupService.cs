using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Reads stations from the database (StationImportService puts them there). Controllers go through this
    /// service instead of the DbContext so every station query lives in one place. Read-only: nothing here is saved, so
    /// nothing is tracked.
    /// </summary>
    public class StationLookupService
    {
        // How long a station looked up by ID is kept in memory. Stations change at most once a day (the import).
        public static readonly TimeSpan StationCacheDuration = TimeSpan.FromMinutes(10);

        private readonly NextTrainDbContext _dbContext;
        private readonly IMemoryCache _cache;

        public StationLookupService(NextTrainDbContext dbContext, IMemoryCache cache)
        {
            _dbContext = dbContext;
            _cache = cache;
        }

        private IQueryable<Station> Stations => _dbContext.Stations.AsNoTracking();

        // Every departures poll starts here, so a station is kept in memory for 10 minutes rather than read each time.
        // Only stations found under their exact ID are kept: anyone can ask for any ID, or for "PLACE-PKTRM" (the
        // database ignores case), and those shouldn't pile up in memory.
        public async Task<Station?> GetByMbtaStopIdAsync(string mbtaStopId)
        {
            var key = ("station", mbtaStopId);
            if (_cache.TryGetValue(key, out Station? cached)) return cached;
            var station = await Stations.FirstOrDefaultAsync(s => s.MbtaStopId == mbtaStopId);
            if (station?.MbtaStopId == mbtaStopId) _cache.Set(key, station, StationCacheDuration);
            return station;
        }

        // The stations and stops with these IDs, by ID; unknown IDs are left out.
        public async Task<Dictionary<string, Station>> GetByMbtaStopIdsAsync(string[] mbtaStopIds) =>
            await Stations.Where(s => mbtaStopIds.Contains(s.MbtaStopId)).ToDictionaryAsync(s => s.MbtaStopId);

        // Every subway station, or every stop on one route (subway or bus; with a direction, only that direction's), A-Z.
        public async Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null, int? directionId = null) =>
            await ServingRoute(routeId, directionId).OrderBy(s => s.Name).ToListAsync();

        // Bus stops that aren't subway stations, A-Z. (Subway stations buses stop at come with the subway ones.)
        public async Task<IReadOnlyList<Station>> GetBusStopsAsync() =>
            await Stations.Where(s => s.RouteId == "").OrderBy(s => s.Name).ToListAsync();

        // No route: subway stations only, which is what older app versions expect. A route: the stops it serves.
        // This builds a database query; nothing runs until ToListAsync.
        // A transfer station's RouteId lists all its lines ("Orange,Red"), so we match whole entries by wrapping in
        // commas: ",Orange,Red," contains ",Red,", but ",Green-B,Red," does not contain ",Green,". BusRoutes holds
        // "route:direction" pairs, so ",1:" finds route 1 (not 10) and ",1:0" one direction.
        private IQueryable<Station> ServingRoute(string? routeId, int? directionId)
        {
            if (string.IsNullOrWhiteSpace(routeId)) return Stations.Where(s => s.RouteId != "");
            var subway = "," + routeId + ",";
            var bus = "," + routeId + ":" + directionId;
            return Stations.Where(s => ("," + s.RouteId + ",").Contains(subway) || ("," + s.BusRoutes).Contains(bus));
        }
    }
}
