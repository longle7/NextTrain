using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Live times for one ride: the next trains (or buses) on a route one way from a stop, and when they reach a later
    /// stop. Shared by transfer advice (/connections) and trip planning (/trips). Each MBTA call is cached 10 seconds
    /// and shared with everyone asking the same thing.
    /// </summary>
    public static class LegTimes
    {
        // The route's departures one way from a stop at or after `after`, soonest first. MBTA keeps listing a train for
        // a few minutes after it leaves; only trains still to come count.
        public static async Task<List<MbtaPredictionDto>> DeparturesAsync(
            IMbtaClient mbta, string stopId, string routeId, int directionId, DateTimeOffset after) =>
            [.. (await mbta.GetPredictionsAsync(stopId, routeId))
                .Where(p => p.Relationships.Route.Data.Id == routeId && p.Attributes.DirectionId == directionId && p.Attributes.DepartureTime >= after)
                .OrderBy(p => p.Attributes.DepartureTime)];

        // The next `count` of those, and when each reaches `toStopId`. A train that doesn't stop there drops out.
        public static async Task<List<(DateTimeOffset Departure, DateTimeOffset Arrival)>> RidesAsync(
            IMbtaClient mbta, string stopId, string routeId, int directionId, string toStopId, DateTimeOffset after, int count = 3)
        {
            var departures = (await DeparturesAsync(mbta, stopId, routeId, directionId, after)).Take(count).ToList();
            if (departures.Count == 0) return [];

            var arrivals = (await mbta.GetTripPredictionsAsync(toStopId, string.Join(",", departures.Select(p => p.Relationships.Trip.Data.Id))))
                .Where(p => (p.Attributes.ArrivalTime ?? p.Attributes.DepartureTime) is not null)
                .GroupBy(p => p.Relationships.Trip.Data.Id)
                .ToDictionary(g => g.Key, g => g.Min(p => (p.Attributes.ArrivalTime ?? p.Attributes.DepartureTime)!.Value));
            return [.. departures
                .Where(p => arrivals.ContainsKey(p.Relationships.Trip.Data.Id))
                .Select(p => (p.Attributes.DepartureTime!.Value, arrivals[p.Relationships.Trip.Data.Id]))];
        }
    }
}
