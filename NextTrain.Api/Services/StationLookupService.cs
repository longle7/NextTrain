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

        // All stations, or only one route's, A-Z.
        public async Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null) =>
            await ServingRoute(routeId).OrderBy(s => s.Name).ToListAsync();

        // Every station, or only those on routeId. This builds a database query; nothing runs until ToListAsync.
        // A transfer station's RouteId lists all its lines ("Orange,Red"), so we match whole entries by wrapping in
        // commas: ",Orange,Red," contains ",Red,", but ",Green-B,Red," does not contain ",Green,".
        private IQueryable<Station> ServingRoute(string? routeId)
        {
            if (string.IsNullOrWhiteSpace(routeId)) return _dbContext.Stations;
            var needle = "," + routeId + ",";
            return _dbContext.Stations.Where(s => ("," + s.RouteId + ",").Contains(needle));
        }
    }
}
