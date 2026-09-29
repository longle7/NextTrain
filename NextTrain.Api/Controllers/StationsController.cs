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

        // GET /stations/place-pktrm/predictions?route=Red&direction=0
        [HttpGet("{mbtaStopId}/predictions")]
        public async Task<ActionResult<IEnumerable<PredictionResponse>>> GetPredictions(
            string mbtaStopId,
            [FromServices] IMbtaClient mbta,
            [FromQuery] string? route,
            [FromQuery, Range(0, 1)] int? direction)
        {
            var station = await _lookup.GetByMbtaStopIdAsync(mbtaStopId);
            if (station is null)
            {
                return NotFound();
            }

            IReadOnlyList<MbtaPredictionDto> predictions;
            try
            {
                // Always fetch all of the station's routes so every filter combination shares one cache entry.
                predictions = await mbta.GetPredictionsAsync(station.MbtaStopId, station.RouteId);
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                return Problem("MBTA predictions are temporarily unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            return Ok(predictions
                .Select(p => new PredictionResponse(
                    p.Relationships.Route.Data.Id,
                    p.Attributes.DirectionId,
                    p.Attributes.ArrivalTime,
                    p.Attributes.DepartureTime,
                    p.Attributes.Status))
                .Where(p => route is null || p.RouteId == route)
                .Where(p => direction is null || p.DirectionId == direction)
                .Where(p => p.ArrivalTime is not null || p.DepartureTime is not null) // skipped/cancelled stops
                .OrderBy(p => p.DepartureTime ?? p.ArrivalTime));
        }
    }

    public record PredictionResponse(
        string RouteId,
        int DirectionId,
        DateTimeOffset? ArrivalTime,
        DateTimeOffset? DepartureTime,
        string? Status);
}
