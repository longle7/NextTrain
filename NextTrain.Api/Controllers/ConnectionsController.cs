using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Transfer advice for a ride that changes lines partway: which second-line train each of the next first-line
    /// trains makes, and whether to take your time or hurry (see ConnectionAdvice). Public: it uses no user data.
    /// </summary>
    [ApiController]
    [Route("connections")]
    public class ConnectionsController : ControllerBase
    {
        // GET /connections?from=place-pktrm&route=Green-D&direction=1&via=place-gover&toRoute=Blue&toDirection=1&minutes=3
        // Three MBTA calls, each cached 10 seconds and shared with everyone asking the same thing: the first line's next
        // trains at the boarding stop, when those trains reach the transfer station, and the second line's departures
        // from there.
        [HttpGet]
        public async Task<ConnectionPlan> Get(
            [FromServices] IMbtaClient mbta,
            [FromServices] TimeProvider clock,
            [FromQuery, Required, RegularExpression(StationRoutes.StopIdPattern)] string from,
            [FromQuery, Required, RegularExpression(StationRoutes.RouteIdPattern)] string route,
            [FromQuery, Range(0, 1)] int direction,
            [FromQuery, Required, RegularExpression(StationRoutes.StopIdPattern)] string via,
            [FromQuery, Required, RegularExpression(StationRoutes.RouteIdPattern)] string toRoute,
            [FromQuery, Range(0, 1)] int toDirection,
            [FromQuery, Range(1, 10)] int minutes = 3)
        {
            // MBTA keeps listing a train for a few minutes after it leaves; advice is only about trains still to come.
            var now = clock.GetUtcNow();
            var firstLeg = (await mbta.GetPredictionsAsync(from, route))
                .Where(p => p.Relationships.Route.Data.Id == route && p.Attributes.DirectionId == direction && p.Attributes.DepartureTime >= now)
                .OrderBy(p => p.Attributes.DepartureTime)
                .Take(3)
                .ToList();

            // When each of those trains reaches the transfer station. A train that doesn't stop there drops out.
            var arrivals = firstLeg.Count == 0
                ? new Dictionary<string, DateTimeOffset>()
                : (await mbta.GetTripPredictionsAsync(via, string.Join(",", firstLeg.Select(p => p.Relationships.Trip.Data.Id))))
                    .Where(p => (p.Attributes.ArrivalTime ?? p.Attributes.DepartureTime) is not null)
                    .GroupBy(p => p.Relationships.Trip.Data.Id)
                    .ToDictionary(g => g.Key, g => g.Min(p => (p.Attributes.ArrivalTime ?? p.Attributes.DepartureTime)!.Value));

            var secondLeg = (await mbta.GetPredictionsAsync(via, toRoute))
                .Where(p => p.Relationships.Route.Data.Id == toRoute && p.Attributes.DirectionId == toDirection && p.Attributes.DepartureTime >= now)
                .Select(p => p.Attributes.DepartureTime!.Value);

            return ConnectionAdvice.Plan(
                firstLeg
                    .Where(p => arrivals.ContainsKey(p.Relationships.Trip.Data.Id))
                    .Select(p => (p.Attributes.DepartureTime!.Value, arrivals[p.Relationships.Trip.Data.Id])),
                secondLeg,
                TimeSpan.FromMinutes(minutes));
        }
    }
}
