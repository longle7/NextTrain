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
            var now = clock.GetUtcNow();
            var firstLeg = await LegTimes.RidesAsync(mbta, from, route, direction, via, now);
            var secondLeg = await LegTimes.DeparturesAsync(mbta, via, toRoute, toDirection, now);
            return ConnectionAdvice.Plan(firstLeg, secondLeg.Select(p => p.Attributes.DepartureTime!.Value), TimeSpan.FromMinutes(minutes));
        }
    }
}
