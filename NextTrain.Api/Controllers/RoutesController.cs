using Microsoft.AspNetCore.Mvc;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Subway lines with display names, colors, and direction labels.
    /// </summary>
    [ApiController]
    [Route("routes")]
    public class RoutesController : ControllerBase
    {
        // GET /routes
        [HttpGet]
        public async Task<ActionResult<IEnumerable<RouteResponse>>> GetAll([FromServices] IMbtaClient mbta)
        {
            try
            {
                var routes = await mbta.GetSubwayRoutesAsync();
                return Ok(routes.Select(r => new RouteResponse(
                    r.Id,
                    r.Attributes.LongName,
                    "#" + r.Attributes.Color,
                    "#" + r.Attributes.TextColor,
                    r.Attributes.DirectionNames,
                    r.Attributes.DirectionDestinations)));
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                return Problem("MBTA routes are temporarily unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }
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
