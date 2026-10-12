using System.Text.Json.Serialization;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Transfer advice for a commute that changes lines (e.g. the Green Line to the Blue Line at Government Center):
    /// which second-line train each of the next first-line trains connects to, and whether that means the rider can
    /// take their time or should hurry.
    /// </summary>
    public static class ConnectionAdvice
    {
        // Missing the next train and waiting this much longer for a connection is worth hurrying for.
        public static readonly TimeSpan HurryGap = TimeSpan.FromMinutes(10);

        /// <param name="firstLeg">The next first-line trains: when each leaves the boarding stop and reaches the transfer station.</param>
        /// <param name="secondLeg">The second line's departures from the transfer station.</param>
        /// <param name="transfer">The time the rider needs to get from one platform to the other.</param>
        public static ConnectionPlan Plan(
            IEnumerable<(DateTimeOffset Departure, DateTimeOffset Arrival)> firstLeg, IEnumerable<DateTimeOffset> secondLeg, TimeSpan transfer)
        {
            var departures = secondLeg.Order().ToList();
            var trains = firstLeg
                .OrderBy(t => t.Departure)
                .Take(3)
                .Select(t => new ConnectionTrain(t.Departure, t.Arrival, departures.Cast<DateTimeOffset?>().FirstOrDefault(d => d >= t.Arrival + transfer)))
                .ToList();

            var advice = trains switch
            {
                [] or [{ Connection: null }, ..] => Advice.Unknown,
                // This train or the next one: same connection either way.
                [var first, { Connection: var next }, ..] when next == first.Connection => Advice.NoRush,
                // Miss this one and the next connection is a long wait.
                [var first, { Connection: { } next }, ..] when next - first.Connection >= HurryGap => Advice.Hurry,
                // The next train's connection is past the last predicted departure: if even that one is a long wait
                // after this train's, so is whatever comes after it.
                [var first, { Connection: null }, ..] when departures[^1] - first.Connection >= HurryGap => Advice.Hurry,
                _ => Advice.Normal,
            };
            return new ConnectionPlan(advice, trains);
        }
    }

    [JsonConverter(typeof(JsonStringEnumConverter<Advice>))]
    public enum Advice
    {
        Unknown, // no second-line times far enough ahead (or no first-line trains)
        NoRush,
        Hurry,
        Normal,
    }

    // Connection: the first second-line departure this train can make, or null if none is predicted yet.
    public record ConnectionTrain(DateTimeOffset Departure, DateTimeOffset Arrival, DateTimeOffset? Connection);

    public record ConnectionPlan(Advice Advice, IReadOnlyList<ConnectionTrain> Trains);
}
