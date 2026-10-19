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
        // Three MBTA calls, each a stop and a route, cached 15 seconds and shared with everyone asking the same thing:
        // the first line's next trains at the boarding stop, its predictions where those trains reach the transfer
        // station, and the second line's departures from there. `off`: where the first ride is left when the change is
        // a short walk to `via` (off the 66 at Tremont St opp Roxbury Crossing, onto the 22 at Columbus Ave @ Malcolm X
        // Blvd); `via` itself without it.
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
            [FromQuery, Range(1, 10)] int minutes = 3,
            [FromQuery, RegularExpression(StationRoutes.StopIdPattern)] string? off = null)
        {
            var now = clock.GetUtcNow();
            var firstLeg = await LegTimes.RidesAsync(mbta, from, route, direction, off ?? via, now);
            var secondLeg = await LegTimes.DeparturesAsync(mbta, via, toRoute, toDirection, now);
            return ConnectionAdvice.Plan(firstLeg, secondLeg.Select(p => p.Attributes.DepartureTime!.Value), TimeSpan.FromMinutes(minutes));
        }
    }
}
