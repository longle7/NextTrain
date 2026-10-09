using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Live subway train positions for the map and the line diagrams. IMbtaClient caches them for 10 seconds,
    /// so however many people are looking, MBTA is asked at most once per refresh.
    /// </summary>
    [ApiController]
    [Route("vehicles")]
    public class VehiclesController : ControllerBase
    {
        // GET /vehicles: every subway train. ?route=1: that route's vehicles, e.g. a bus route's buses.
        // (A 503 when MBTA is down comes from MbtaUnavailableFilter.)
        [HttpGet]
        public Task<IReadOnlyList<MbtaVehicle>> GetAll(
            [FromServices] IMbtaClient mbta,
            [FromQuery, RegularExpression(StationRoutes.RouteIdListPattern)] string? route) =>
            route is null ? mbta.GetSubwayVehiclesAsync() : mbta.GetRouteVehiclesAsync(route);
    }
}
