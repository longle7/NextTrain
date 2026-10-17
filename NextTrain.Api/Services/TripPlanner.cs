using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Trips from the stops near where you are to the stops near where you're going (GET /trips): one ride, or two with
    /// one change. The app picks the nearby stops on the phone and sends only their IDs and the walk to each, so this
    /// never knows where anyone is.
    ///   1. What serves each stop: its subway lines both ways, its buses the way they stop there.
    ///   2. Each of those route-directions' stops in riding order (MBTA, cached an hour).
    ///   3. Every way there: a ride from a start stop to a later end stop, or a ride to a stop that is (or is within
    ///      150 m of) a stop where a second ride goes on to an end stop.
    ///   4. A rough ranking (walking + stops ridden): only the best few get live times, to spare MBTA.
    ///   5. Live times (LegTimes): the train to walk to (ConnectionAdvice.StartAdvice), when it gets there, and the
    ///      connection (ConnectionAdvice.Plan). The earliest arrivals win.
    /// ponytail: live predictions only, at most one change, 8 stops per end; add schedules for late night and a second
    /// change if trips come back empty.
    /// </summary>
    public static class TripPlanner
    {
        // Close enough to change between on foot.
        public const double ChangeWalkMeters = 150;

        // Changing within a station (the /connections default); between nearby stops it's the walk plus a minute.
        private const int InStationMinutes = 3;

        // The rough ranking's guess at the wait for the second ride.
        private const int ChangeWaitMinutes = 5;

        // How many trips get live times, and how many are shown.
        // ponytail: up to 6 x 4 MBTA calls per request (cached 10 s, shared by URL); fewer candidates if the key's quota gets tight.
        private const int Candidates = 6, Options = 3;

        public static async Task<List<TripOption>> PlanAsync(
            IMbtaClient mbta, StationLookupService lookup, Dictionary<string, int> from, Dictionary<string, int> to, DateTimeOffset now)
        {
            var stations = await lookup.GetByMbtaStopIdsAsync([.. from.Keys, .. to.Keys]);
            var ways = stations.Values.SelectMany(Ways).Distinct().ToList();
            var stops = ways.Zip(await Task.WhenAll(ways.Select(w => mbta.GetStopDtosAsync(w.RouteId, w.DirectionId))))
                .ToDictionary(x => x.First, x => x.Second.ToList());

            // Where each nearby stop sits on each route-direction that serves it.
            List<Stop> On(Dictionary<string, int> ends) =>
            [
                .. from end in ends
                   where stations.ContainsKey(end.Key)
                   from way in Ways(stations[end.Key])
                   let i = stops[way].FindIndex(s => s.Id == end.Key)
                   where i >= 0
                   select new Stop(way, i, end.Key, end.Value)
            ];
            var boardings = On(from);
            var alightings = On(to);

            // One ride: a start stop before an end stop, on the same route the same way. The best one each.
            var direct = (from b in boardings
                          from a in alightings
                          where a.Way == b.Way && a.Index > b.Index
                          select new Candidate(b, a, b.Walk + Ride(b.Way, a.Index - b.Index) + a.Walk))
                .GroupBy(c => c.Board.Way).Select(g => g.MinBy(c => c.Score)!).ToList();

            // One change, only between rides that don't go the whole way: riding on beats changing, and walking to the
            // second ride at the start beats riding to it. Each ride from (or to) its closest stop.
            var directWays = direct.Select(c => c.Board.Way).ToHashSet();
            var firsts = boardings.Where(b => !directWays.Contains(b.Way)).GroupBy(b => b.Way).Select(g => g.MinBy(b => b.Walk)!);
            var seconds = alightings.Where(a => !directWays.Contains(a.Way)).GroupBy(a => a.Way).Select(g => g.MinBy(a => a.Walk)!).ToList();
            var changes = firsts.SelectMany(b => seconds.Where(a => a.Way.RouteId != b.Way.RouteId).Select(a => BestChange(b, a, stops))).OfType<Candidate>();

            var best = direct.Concat(changes).OrderBy(c => c.Score).Take(Candidates).ToList();

            // The stops where people change weren't loaded with the ends.
            foreach (var (id, station) in await lookup.GetByMbtaStopIdsAsync([.. best.SelectMany(c => new[] { c.Off?.Id, c.On?.Id }).OfType<string>()]))
            {
                stations.TryAdd(id, station);
            }
            TripStop StopAt(Stop s) =>
                TripStop.From(stations.GetValueOrDefault(s.Id) ?? new Station { MbtaStopId = s.Id, Name = stops[s.Way][s.Index].Attributes.Name });

            // The same stops by another route (Green Line branches share track) are the same trip: the earliest stays.
            var options = await Task.WhenAll(best.Select(c => LiveAsync(mbta, c, StopAt, now)));
            return
            [
                .. options.OfType<TripOption>()
                    .OrderBy(o => o.Arrival)
                    .DistinctBy(o => string.Join(">", o.Legs.Select(l => $"{l.From.Id}>{l.To.Id}")))
                    .Take(Options)
            ];
        }

        // Live times for one way there, or null if they don't line up (nothing predicted, or no connection yet).
        private static async Task<TripOption?> LiveAsync(IMbtaClient mbta, Candidate c, Func<Stop, TripStop> stopAt, DateTimeOffset now)
        {
            var walk = TimeSpan.FromMinutes(c.Board.Walk);
            var getOff = c.Off ?? c.Alight;
            var first = await LegTimes.RidesAsync(mbta, c.Board.Id, c.Board.Way.RouteId, c.Board.Way.DirectionId, getOff.Id, now + walk);
            if (ConnectionAdvice.StartAdvice(first.Select(r => r.Departure), walk, now) is not { } start) return null;
            first = [.. first.SkipWhile(r => r.Departure < start.Departure)]; // from the one to catch
            var legs = new List<TripLeg> { Leg(c.Board, getOff, first[0]) };

            ConnectionPlan? plan = null;
            if (c.On is not null)
            {
                var change = TimeSpan.FromMinutes(c.ChangeMinutes);
                var second = await LegTimes.RidesAsync(mbta, c.On.Id, c.Alight.Way.RouteId, c.Alight.Way.DirectionId, c.Alight.Id, first[0].Arrival + change);
                plan = ConnectionAdvice.Plan(first, second.Select(r => r.Departure), change);
                if (plan.Trains[0].Connection is not { } connection) return null;
                legs.Add(Leg(c.On, c.Alight, second.First(r => r.Departure == connection)));
            }

            return new TripOption(legs[^1].Arrival.AddMinutes(c.Alight.Walk), (int)(start.Departure - walk - now).TotalMinutes,
                start.Advice, plan, c.Board.Walk, c.Alight.Walk, legs);

            TripLeg Leg(Stop from, Stop to, (DateTimeOffset Departure, DateTimeOffset Arrival) ride) =>
                new(from.Way.RouteId, from.Way.DirectionId, stopAt(from), stopAt(to), ride.Departure, ride.Arrival);
        }

        // The best place to change from b's ride to a's: a later stop on the first that is, or is near, an earlier stop on
        // the second.
        private static Candidate? BestChange(Stop b, Stop a, Dictionary<RouteWay, List<MbtaStopDto>> stops)
        {
            Candidate? best = null;
            var (first, second) = (stops[b.Way], stops[a.Way]);
            for (var k = b.Index + 1; k < first.Count; k++)
            {
                for (var m = 0; m < a.Index; m++)
                {
                    if (ChangeMinutes(first[k], second[m]) is not { } minutes) continue;
                    var score = b.Walk + Ride(b.Way, k - b.Index) + minutes + ChangeWaitMinutes + Ride(a.Way, a.Index - m) + a.Walk;
                    if (score < (best?.Score ?? int.MaxValue))
                        best = new Candidate(b, a, score, new Stop(b.Way, k, first[k].Id, 0), new Stop(a.Way, m, second[m].Id, 0), minutes);
                }
            }
            return best;
        }

        // Minutes to change between two stops: within a station, or a walk of up to 150 m (at the app's walking speed,
        // see walkLabel in geo.ts) plus a minute. Null if they're farther apart.
        private static int? ChangeMinutes(MbtaStopDto x, MbtaStopDto y)
        {
            if (x.Id == y.Id) return InStationMinutes;
            if (x.Attributes is not { Latitude: { } lat1, Longitude: { } lon1 } || y.Attributes is not { Latitude: { } lat2, Longitude: { } lon2 }) return null;
            if (Math.Abs(lat1 - lat2) > 0.002) return null; // quick no: 150 m is 0.00135 degrees of latitude
            var (dx, dy) = ((lon2 - lon1) * Math.Cos(lat1 * Math.PI / 180), lat2 - lat1);
            var meters = Math.Sqrt(dx * dx + dy * dy) * 111_320; // flat-earth distance: plenty at this scale
            return meters <= ChangeWalkMeters ? (int)Math.Max(1, Math.Round(meters / 1609.34 * 1.25 * 20)) + 1 : null;
        }

        // Rough minutes for riding some stops: subway stops are farther apart than bus stops.
        private static int Ride(RouteWay way, int stops) => stops * (StationImportService.SubwayRoutes.Contains(way.RouteId) ? 2 : 1);

        // What serves a stop: its subway lines both ways, and its buses the way they stop there ("1:0").
        private static IEnumerable<RouteWay> Ways(Station s) =>
            s.SubwayRouteIds().SelectMany(r => new[] { new RouteWay(r, 0), new RouteWay(r, 1) })
                .Concat((s.BusRoutes ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Split(':')).Select(p => new RouteWay(p[0], int.Parse(p[1]))));

        // A route one way: the Red Line toward Alewife is ("Red", 1).
        private record struct RouteWay(string RouteId, int DirectionId);

        // A stop on a route-direction (Index: its place in riding order) and the walk to it from the start or end.
        private record Stop(RouteWay Way, int Index, string Id, int Walk);

        // A way there: board, ride, and get off at Alight; with a change, get off at Off and on at On between.
        // Score: the rough ranking, in minutes.
        private record Candidate(Stop Board, Stop Alight, int Score, Stop? Off = null, Stop? On = null, int ChangeMinutes = 0);
    }

    // A way there with live times. Arrival: at the destination, walking included. LeaveIn: minutes until you set off.
    // StartAdvice: Hurry or NoRush (ConnectionAdvice.StartAdvice). TransferAdvice: the change's, as GET /connections has it.
    public record TripOption(
        DateTimeOffset Arrival, int LeaveIn, Advice StartAdvice, ConnectionPlan? TransferAdvice, int WalkToFirst, int WalkFromLast, IReadOnlyList<TripLeg> Legs);

    // One ride: the train (or bus) to catch at From, and when it gets to To.
    public record TripLeg(string RouteId, int DirectionId, TripStop From, TripStop To, DateTimeOffset Departure, DateTimeOffset Arrival);

    // A stop as a trip shows it. Every leg's stops are made here.
    public record TripStop(string Id, string Name)
    {
        public static TripStop From(Station s) => new(s.MbtaStopId, s.Name);
    }
}
