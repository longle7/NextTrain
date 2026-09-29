using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Service that imports subway stations from MBTA into the Stations table.
    /// </summary>
    public class StationImportService : IStationImportService
    {
        // MBTA subway routes (route types 0 and 1). Mattapan is part of the Red Line.
        // ponytail: hardcoded list, fetch from /routes?filter[type]=0,1 if MBTA adds lines.
        public static readonly string[] SubwayRoutes =
        {
            "Red", "Mattapan", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"
        };

        // Station ID -> average weekday boardings, from the embedded MBTA ridership snapshot.
        // ponytail: static Fall 2024 snapshot, refresh the JSON when MBTA publishes a new season.
        private static readonly Dictionary<string, int> Ridership = LoadRidership();

        private readonly IMbtaClient _mbtaClient;
        private readonly NextTrainDbContext _dbContext;

        public StationImportService(IMbtaClient mbtaClient, NextTrainDbContext dbContext)
        {
            _mbtaClient = mbtaClient;
            _dbContext = dbContext;
        }

        public async Task ImportStationsAsync()
        {
            var stopsByRoute = new List<(string RouteId, MbtaStopDto Stop)>();

            foreach (var routeId in SubwayRoutes)
            {
                var stops = await _mbtaClient.GetStopDtosAsync(routeId);
                stopsByRoute.AddRange(stops.Select(stop => (routeId, stop)));
            }

            var imported = MergeStops(stopsByRoute);
            foreach (var station in imported)
            {
                station.AverageWeekdayBoardings = Ridership.TryGetValue(station.MbtaStopId, out var boardings) ? boardings : null;
            }

            var existingById = await _dbContext.Stations.ToDictionaryAsync(s => s.MbtaStopId);

            foreach (var station in imported)
            {
                if (existingById.TryGetValue(station.MbtaStopId, out var existing))
                {
                    existing.Name = station.Name;
                    existing.Latitude = station.Latitude;
                    existing.Longitude = station.Longitude;
                    existing.PlatformCode = station.PlatformCode;
                    existing.RouteId = station.RouteId;
                    existing.AverageWeekdayBoardings = station.AverageWeekdayBoardings;
                    existing.UpdatedAtUtc = DateTime.UtcNow;
                }
                else
                {
                    _dbContext.Stations.Add(station);
                }
            }

            await _dbContext.SaveChangesAsync();
        }

        private static Dictionary<string, int> LoadRidership()
        {
            using var stream = typeof(StationImportService).Assembly.GetManifestResourceStream("ridership.json")!;
            using var json = JsonDocument.Parse(stream);
            return json.RootElement.GetProperty("averageWeekdayBoardings")
                .EnumerateObject()
                .ToDictionary(p => p.Name, p => p.Value.GetInt32());
        }

        /// <summary>
        /// Collapses per-route stop lists into one station per MBTA stop ID.
        /// Transfer stations get a comma-separated, sorted RouteId (e.g., "Orange,Red").
        /// Stops without coordinates are skipped.
        /// </summary>
        public static List<Station> MergeStops(IEnumerable<(string RouteId, MbtaStopDto Stop)> stopsByRoute)
        {
            return stopsByRoute
                .Where(x => x.Stop.Attributes.Latitude.HasValue && x.Stop.Attributes.Longitude.HasValue)
                .GroupBy(x => x.Stop.Id)
                .Select(g =>
                {
                    var stop = g.First().Stop;
                    return new Station
                    {
                        MbtaStopId = stop.Id,
                        Name = stop.Attributes.Name,
                        Latitude = stop.Attributes.Latitude!.Value,
                        Longitude = stop.Attributes.Longitude!.Value,
                        PlatformCode = stop.Attributes.PlatformCode,
                        RouteId = string.Join(",", g.Select(x => x.RouteId).Distinct().Order(StringComparer.Ordinal)),
                        CreatedAtUtc = DateTime.UtcNow
                    };
                })
                .ToList();
        }
    }
}
