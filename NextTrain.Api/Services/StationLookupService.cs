using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Reads stations from the database (StationImportService puts them there). Controllers go through this
    /// service instead of the DbContext so every station query lives in one place.
    /// </summary>
    public class StationLookupService : IStationLookupService
    {
        private readonly NextTrainDbContext _dbContext;

        public StationLookupService(NextTrainDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        // The closest station by straight-line distance. There are only ~125 subway stations, so loading them and
        // comparing in memory is simpler than a spatial database query, and plenty fast. Null when there are none.
        public async Task<Station?> GetNearestStationAsync(double latitude, double longitude, string? routeId = null)
        {
            var stations = await ServingRoute(routeId).ToListAsync();
            return stations.MinBy(s => DistanceKm(latitude, longitude, s.Latitude, s.Longitude));
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

        // Great-circle ("haversine") distance in kilometers: the straight line between two points over the Earth's curve.
        private static double DistanceKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double EarthRadiusKm = 6371.0;
            static double Radians(double degrees) => degrees * Math.PI / 180.0;

            var dLat = Radians(lat2 - lat1);
            var dLon = Radians(lon2 - lon1);
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(Radians(lat1)) * Math.Cos(Radians(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return EarthRadiusKm * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }
    }
}
