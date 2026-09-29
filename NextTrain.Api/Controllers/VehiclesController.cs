using Microsoft.AspNetCore.Mvc;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Live subway train positions for the map.
    /// </summary>
    [ApiController]
    [Route("vehicles")]
    public class VehiclesController : ControllerBase
    {
        // GET /vehicles
        [HttpGet]
        public async Task<ActionResult<IEnumerable<MbtaVehicle>>> GetAll([FromServices] IMbtaClient mbta)
        {
            try
            {
                return Ok(await mbta.GetSubwayVehiclesAsync());
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                return Problem("MBTA train positions are temporarily unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }
    }
}
