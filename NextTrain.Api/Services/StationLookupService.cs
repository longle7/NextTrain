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
    /// EF Core-based station lookup service with haversine distance calculation.
    /// </summary>
    public class StationLookupService : IStationLookupService
    {
        private readonly NextTrainDbContext _dbContext;

        public StationLookupService(NextTrainDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<Station?> GetNearestStationAsync(double latitude, double longitude, string? routeId = null)
        {
            // Load stations (optionally filter by route).
            IQueryable<Station> query = _dbContext.Stations;

            if (!string.IsNullOrWhiteSpace(routeId))
            {
                query = query.Where(s => s.RouteId == routeId);
            }

            var stations = await query.ToListAsync();

            if (stations.Count == 0)
            {
                return null;
            }

            Station? nearest = null;
            double nearestDistanceKm = double.MaxValue;

            foreach (var station in stations)
            {
                var distanceKm = CalculateDistanceKm(
                    latitude,
                    longitude,
                    station.Latitude,
                    station.Longitude);

                if (distanceKm < nearestDistanceKm)
                {
                    nearestDistanceKm = distanceKm;
                    nearest = station;
                }
            }

            return nearest;
        }

        public async Task<Station?> GetByMbtaStopIdAsync(string mbtaStopId)
        {
            return await _dbContext.Stations
                .FirstOrDefaultAsync(s => s.MbtaStopId == mbtaStopId);
        }

        public async Task<IReadOnlyList<Station>> GetAllStationsAsync(string? routeId = null)
        {
            IQueryable<Station> query = _dbContext.Stations;

            if (!string.IsNullOrWhiteSpace(routeId))
            {
                query = query.Where(s => s.RouteId == routeId);
            }

            var stations = await query
                .OrderBy(s => s.Name)
                .ToListAsync();

            return stations;
        }

        // Haversine formula for distance in kilometers between two lat/lon points.
        private static double CalculateDistanceKm(
            double lat1,
            double lon1,
            double lat2,
            double lon2)
        {
            const double EarthRadiusKm = 6371.0;

            double dLat = DegreesToRadians(lat2 - lat1);
            double dLon = DegreesToRadians(lon2 - lon1);

            double a =
                Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(DegreesToRadians(lat1)) *
                Math.Cos(DegreesToRadians(lat2)) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

            return EarthRadiusKm * c;
        }

        private static double DegreesToRadians(double degrees)
        {
            return degrees * Math.PI / 180.0;
        }
    }
}