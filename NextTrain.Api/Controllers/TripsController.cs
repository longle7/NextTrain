using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// The best trains and buses between the stops near two places, with at most one change (TripPlanner). Public and
    /// anonymous: the app sends only nearby stop IDs and the walk to each (no location, no user ID), and nothing is stored.
    /// </summary>
    [ApiController]
    [Route("trips")]
    public class TripsController : ControllerBase
    {
        // GET /trips?from=1308:4,place-cool:7&to=place-gover:3: stop ID and minutes' walk, up to 8 stops each end.
        // Up to 3 trips, earliest arrival first; none when nothing has live times.
        [HttpGet]
        public Task<List<TripOption>> Get(
            [FromServices] IMbtaClient mbta,
            [FromServices] StationLookupService lookup,
            [FromServices] TimeProvider clock,
            [FromQuery, Required, RegularExpression(StationRoutes.StopWalkListPattern)] string from,
            [FromQuery, Required, RegularExpression(StationRoutes.StopWalkListPattern)] string to) =>
            TripPlanner.PlanAsync(mbta, lookup, Walks(from), Walks(to), clock.GetUtcNow());

        // "1308:4,place-cool:7" -> { 1308: 4, place-cool: 7 }. A stop listed twice counts once.
        private static Dictionary<string, int> Walks(string stops) =>
            stops.Split(',').Select(p => p.Split(':')).DistinctBy(p => p[0]).ToDictionary(p => p[0], p => int.Parse(p[1]));
    }
}
