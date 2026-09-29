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

        // GET /stations?route=Red&sort=line
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Station>>> GetAll(
            [FromServices] IMbtaClient mbta,
            [FromQuery] string? route,
            [FromQuery] StationSort sort = StationSort.Name)
        {
            var stations = await _lookup.GetAllStationsAsync(route); // A-Z

            switch (sort)
            {
                case StationSort.Ridership:
                    return Ok(stations.OrderByDescending(s => s.AverageWeekdayBoardings ?? -1));

                case StationSort.Line when route is null:
                    ModelState.AddModelError("sort", "sort=line requires a route.");
                    return ValidationProblem();

                case StationSort.Line:
                    IReadOnlyList<MbtaStopDto> lineOrder;
                    try
                    {
                        lineOrder = await mbta.GetStopDtosAsync(route);
                    }
                    catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
                    {
                        return Problem("MBTA line order is temporarily unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable);
                    }
                    var position = lineOrder.Select((stop, i) => (stop.Id, i)).ToDictionary(x => x.Id, x => x.i);
                    return Ok(stations.OrderBy(s => position.GetValueOrDefault(s.MbtaStopId, int.MaxValue)));

                default:
                    return Ok(stations);
            }
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

    public enum StationSort
    {
        Name,
        Line,      // MBTA's order along the route; requires a route
        Ridership  // busiest first; stations without data last
    }

    public record PredictionResponse(
        string RouteId,
        int DirectionId,
        DateTimeOffset? ArrivalTime,
        DateTimeOffset? DepartureTime,
        string? Status);
}
