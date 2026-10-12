using NextTrain.Api.Services;

namespace NextTrain.Tests;

public class ConnectionAdviceTests
{
    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-10-10T12:00:00-04:00");
    private static DateTimeOffset At(double minutes) => Noon.AddMinutes(minutes);
    private static readonly TimeSpan ThreeMinutes = TimeSpan.FromMinutes(3);

    // A first-line train leaving at `leaves` and reaching the transfer station 6 minutes later.
    private static (DateTimeOffset, DateTimeOffset) Train(double leaves) => (At(leaves), At(leaves + 6));

    [Fact]
    public void NoRush_WhenThisTrainAndTheNextMakeTheSameConnection()
    {
        // Arrive 12:08 and 12:11; with 3 minutes to change, both make the 12:15.
        var plan = ConnectionAdvice.Plan([Train(2), Train(5)], [At(10), At(15), At(30)], ThreeMinutes);

        Assert.Equal(Advice.NoRush, plan.Advice);
        Assert.Equal(new DateTimeOffset?[] { At(15), At(15) }, plan.Trains.Select(t => t.Connection));
    }

    [Fact]
    public void Hurry_WhenMissingThisTrainMeansALongWait()
    {
        // This train makes the 12:15; the next one (arriving 12:16) misses it, and the next connection is 12:30.
        var plan = ConnectionAdvice.Plan([Train(2), Train(10)], [At(15), At(30)], ThreeMinutes);

        Assert.Equal(Advice.Hurry, plan.Advice);
        Assert.Equal(new DateTimeOffset?[] { At(15), At(30) }, plan.Trains.Select(t => t.Connection));
    }

    [Fact]
    public void Normal_WhenTheNextConnectionIsOnlyAFewMinutesLater()
    {
        var plan = ConnectionAdvice.Plan([Train(2), Train(10)], [At(15), At(21)], ThreeMinutes);

        Assert.Equal(Advice.Normal, plan.Advice);
    }

    [Fact]
    public void TheTimeToChangeIsRespected()
    {
        // Arriving 12:08 with a train leaving 12:10: two minutes isn't enough with three needed.
        var plan = ConnectionAdvice.Plan([Train(2)], [At(10), At(14)], ThreeMinutes);

        Assert.Equal(At(14), Assert.Single(plan.Trains).Connection);
        Assert.Equal(Advice.Normal, plan.Advice);
    }

    [Fact]
    public void Unknown_WhenNoConnectionIsPredictedYet_OrNoTrains()
    {
        Assert.Equal(Advice.Unknown, ConnectionAdvice.Plan([Train(2)], [At(5)], ThreeMinutes).Advice);
        Assert.Equal(Advice.Unknown, ConnectionAdvice.Plan([], [At(5)], ThreeMinutes).Advice);
        Assert.Equal(Advice.Unknown, ConnectionAdvice.Plan([Train(2)], [], ThreeMinutes).Advice);
    }

    [Fact]
    public void BeyondThePredictions_HurryOnlyIfEvenTheLastPredictedTrainIsALongWait()
    {
        // The next train (arriving 12:16) has no predicted connection. The last predicted one, 12:26, is 11 minutes
        // after this train's 12:15, so whatever it connects to is a long wait too.
        Assert.Equal(Advice.Hurry, ConnectionAdvice.Plan([Train(2), Train(18)], [At(15), At(26)], ThreeMinutes).Advice);
        // Here the predictions just end soon after 12:15: no way to tell.
        Assert.Equal(Advice.Normal, ConnectionAdvice.Plan([Train(2), Train(18)], [At(15), At(19)], ThreeMinutes).Advice);
    }

    [Fact]
    public void OnlyTheNextThreeTrains_SoonestFirst()
    {
        var plan = ConnectionAdvice.Plan([Train(20), Train(2), Train(10), Train(30)], [At(15), At(40), At(60)], ThreeMinutes);

        Assert.Equal(new[] { At(2), At(10), At(20) }, plan.Trains.Select(t => t.Departure));
    }
}
