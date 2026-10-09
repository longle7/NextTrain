using System;
using System.Collections.Concurrent;
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
    /// Copies subway stations and bus stops from MBTA into our Stations table. StationRefreshService runs it at
    /// startup and daily.
    ///
    /// Subway (ImportSubwayAsync):
    ///   1. Ask MBTA for each subway route's stops, one route at a time. MBTA only says which route a stop is on
    ///      when you filter by a single route, so we can't ask for everything at once.
    ///   2. MergeStops: Park Street appears in both the Red and Green lists, so merge duplicates into one station
    ///      whose RouteId lists every line ("Green-B,Green-C,Green-D,Green-E,Red").
    ///   3. Add ridership (from an embedded data file) to each station.
    ///   4. Upsert: update stations we already have, insert new ones. Stations are never deleted.
    /// Buses (ImportBusAsync), saved separately so a bus problem never holds up the subway:
    ///   1. Ask MBTA for each bus route's stops, per direction (each side of the street is its own stop).
    ///   2. MergeBusStops: one row per stop, its routes and directions in BusRoutes ("1:0,741:1").
    ///   3. A subway station that buses also stop at (South Station: SL1) only gets BusRoutes; its RouteId stays
    ///      subway-only, because older app versions read it. Every other bus stop is a row with an empty RouteId.
    ///   4. Bus stops MBTA stopped listing are deleted, unless a saved commute uses one.
    /// Running it again is always safe.
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
            await ImportSubwayAsync();
            await ImportBusAsync();
        }

        private async Task ImportSubwayAsync()
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
                    Update(existing, station.Name, station.Latitude, station.Longitude, station.IsAccessible,
                        station.RouteId, existing.BusRoutes, station.AverageWeekdayBoardings);
                }
                else
                {
                    _dbContext.Stations.Add(station);
                }
            }

            await _dbContext.SaveChangesAsync();
        }

        private async Task ImportBusAsync()
        {
            // ~150 routes x 2 directions. A few at a time: quick, and well inside MBTA's rate limit.
            var memberships = new ConcurrentBag<(string RouteId, int DirectionId, MbtaStopDto Stop)>();
            var routeDirections = (await _mbtaClient.GetBusRoutesAsync()).SelectMany(r => new[] { (r.Id, 0), (r.Id, 1) });
            await Parallel.ForEachAsync(routeDirections, new ParallelOptions { MaxDegreeOfParallelism = 4 }, async (rd, _) =>
            {
                foreach (var stop in await _mbtaClient.GetStopDtosAsync(rd.Item1, rd.Item2))
                {
                    memberships.Add((rd.Item1, rd.Item2, stop));
                }
            });

            var busStops = MergeBusStops(memberships);
            if (busStops.Count == 0) return; // MBTA answered with nothing: keep what we have rather than wipe it

            var existingById = await _dbContext.Stations.ToDictionaryAsync(s => s.MbtaStopId);
            foreach (var stop in busStops)
            {
                if (!existingById.TryGetValue(stop.MbtaStopId, out var existing))
                {
                    _dbContext.Stations.Add(stop);
                }
                else if (existing.RouteId != "")
                {
                    // A subway station buses also stop at: record its buses, leave everything else as the subway has it.
                    Update(existing, existing.Name, existing.Latitude, existing.Longitude, existing.IsAccessible,
                        existing.RouteId, stop.BusRoutes, existing.AverageWeekdayBoardings);
                }
                else
                {
                    Update(existing, stop.Name, stop.Latitude, stop.Longitude, stop.IsAccessible, "", stop.BusRoutes, null);
                }
            }

            var listed = busStops.Select(s => s.MbtaStopId).ToHashSet();
            foreach (var station in existingById.Values.Where(s => s.RouteId != "" && s.BusRoutes != null && !listed.Contains(s.MbtaStopId)))
            {
                Update(station, station.Name, station.Latitude, station.Longitude, station.IsAccessible, station.RouteId, null, station.AverageWeekdayBoardings);
            }

            // Bus stops MBTA no longer lists. Skipped if MBTA listed under half the stops we have: more likely a bad
            // answer than half the bus network closing overnight. A commute's stop stays until the commute is edited.
            // ponytail: a stop that moves gets a new ID, so a commute on the old one stops getting buses; tell the rider if it happens.
            var gone = existingById.Values.Where(s => s.RouteId == "" && !listed.Contains(s.MbtaStopId)).ToList();
            var busOnlyBefore = existingById.Values.Count(s => s.RouteId == "");
            if (gone.Count > 0 && listed.Count >= busOnlyBefore / 2)
            {
                var goneIds = gone.Select(s => s.Id).ToList();
                var inUse = await _dbContext.UserCommutes.Where(c => goneIds.Contains(c.StationId)).Select(c => c.StationId).ToListAsync();
                _dbContext.Stations.RemoveRange(gone.Where(s => !inUse.Contains(s.Id)));
            }

            await _dbContext.SaveChangesAsync();
        }

        // Copies new values onto a stored station, and touches UpdatedAtUtc only if something changed: thousands of
        // bus stops, and most days nothing changes.
        private static void Update(Station s, string name, double latitude, double longitude, bool? isAccessible,
            string routeId, string? busRoutes, int? boardings)
        {
            if (s.Name == name && s.Latitude == latitude && s.Longitude == longitude && s.IsAccessible == isAccessible &&
                s.RouteId == routeId && s.BusRoutes == busRoutes && s.AverageWeekdayBoardings == boardings) return;
            (s.Name, s.Latitude, s.Longitude, s.IsAccessible, s.RouteId, s.BusRoutes, s.AverageWeekdayBoardings) =
                (name, latitude, longitude, isAccessible, routeId, busRoutes, boardings);
            s.UpdatedAtUtc = DateTime.UtcNow;
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
                        IsAccessible = Accessible(stop),
                        RouteId = string.Join(",", g.Select(x => x.RouteId).Distinct().Order(StringComparer.Ordinal)),
                        CreatedAtUtc = DateTime.UtcNow
                    };
                })
                .ToList();
        }

        /// <summary>
        /// Collapses per-route, per-direction bus stop lists into one row per MBTA stop ID, with an empty RouteId and
        /// every route and direction in BusRoutes, sorted ("1:0,1:1,741:1"). Stops without coordinates are skipped.
        /// </summary>
        public static List<Station> MergeBusStops(IEnumerable<(string RouteId, int DirectionId, MbtaStopDto Stop)> memberships)
        {
            return memberships
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
                        IsAccessible = Accessible(stop),
                        RouteId = "",
                        BusRoutes = string.Join(",", g.Select(x => $"{x.RouteId}:{x.DirectionId}").Distinct().Order(StringComparer.Ordinal)),
                        CreatedAtUtc = DateTime.UtcNow
                    };
                })
                .ToList();
        }

        private static bool? Accessible(MbtaStopDto stop) =>
            stop.Attributes.WheelchairBoarding switch { 1 => true, 2 => false, _ => null };
    }
}
