using Microsoft.AspNetCore.Mvc;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Subway lines: names, colors, direction labels, and the track each one runs on.
    /// Both endpoints are a thin layer over IMbtaClient, which fetches from MBTA and caches for an hour.
    /// If MBTA is down, MbtaUnavailableFilter turns the error into a 503.
    /// </summary>
    [ApiController]
    [Route("routes")]
    public class RoutesController : ControllerBase
    {
        // GET /routes: the lines in MBTA's display order, reshaped from MBTA's format into what the app needs.
        [HttpGet]
        public async Task<IEnumerable<RouteResponse>> GetAll([FromServices] IMbtaClient mbta)
        {
            var routes = await mbta.GetSubwayRoutesAsync();
            return routes.Select(r => new RouteResponse(
                r.Id,
                r.Attributes.LongName,
                "#" + r.Attributes.Color,     // MBTA sends "DA291C"; CSS wants "#DA291C"
                "#" + r.Attributes.TextColor,
                r.Attributes.DirectionNames,
                r.Attributes.DirectionDestinations));
        }

        // GET /routes/shapes: each line's track as an encoded polyline, drawn on the map.
        [HttpGet("shapes")]
        public Task<IReadOnlyList<MbtaShape>> GetShapes([FromServices] IMbtaClient mbta) => mbta.GetSubwayShapesAsync();
    }

    // Direction lists are indexed by direction ID (0 or 1).
    public record RouteResponse(
        string Id,
        string Name,
        string Color,
        string TextColor,
        IReadOnlyList<string> DirectionNames,
        IReadOnlyList<string> DirectionDestinations);
}
