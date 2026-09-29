using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Read-only access to the imported subway stations.
    /// </summary>
    [ApiController]
    [Route("stations")]
    public class StationsController : ControllerBase
    {
        private readonly IStationLookupService _lookup;

        public StationsController(IStationLookupService lookup)
        {
            _lookup = lookup;
        }

        // GET /stations?route=Red
        [HttpGet]
        public async Task<IReadOnlyList<Station>> GetAll([FromQuery] string? route)
        {
            return await _lookup.GetAllStationsAsync(route);
        }

        // GET /stations/nearest?lat=42.3564&lon=-71.0624&route=Red
        [HttpGet("nearest")]
        public async Task<ActionResult<Station>> GetNearest(
            [FromQuery, Required, Range(-90, 90)] double? lat,
            [FromQuery, Required, Range(-180, 180)] double? lon,
            [FromQuery] string? route)
        {
            var station = await _lookup.GetNearestStationAsync(lat!.Value, lon!.Value, route);
            return station is null ? NotFound() : station;
        }

        // GET /stations/place-pktrm
        [HttpGet("{mbtaStopId}")]
        public async Task<ActionResult<Station>> GetById(string mbtaStopId)
        {
            var station = await _lookup.GetByMbtaStopIdAsync(mbtaStopId);
            return station is null ? NotFound() : station;
        }
    }
}
