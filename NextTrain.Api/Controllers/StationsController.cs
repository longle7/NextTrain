using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Stations and their live departures.
    ///
    /// Where the data comes from: station details (name, location, lines) live in our SQL Server database,
    /// imported from MBTA by StationImportService, and are read through StationLookupService.
    /// Live data (departures, line order) comes straight from MBTA through IMbtaClient, which caches it briefly.
    /// If MBTA is down, MbtaUnavailableFilter turns the error into a 503.
    /// </summary>
    [ApiController]
    [Route("stations")]
    public class StationsController : ControllerBase
    {
        private readonly StationLookupService _lookup;

        public StationsController(StationLookupService lookup)
        {
            _lookup = lookup;
        }

        // GET /stations?route=Red&sort=line, or a bus route's stops one way: /stations?route=1&direction=0&sort=line
        // No route: every subway station (what older app versions expect; bus stops are at /bus-stops).
        // Stations come from the database sorted A-Z; the other sorts reorder that list.
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Station>>> GetAll(
            [FromServices] IMbtaClient mbta,
            [FromQuery, RegularExpression(StationRoutes.RouteIdPattern)] string? route,
            [FromQuery, Range(0, 1)] int? direction,
            [FromQuery] StationSort sort = StationSort.Name)
        {
            var stations = await _lookup.GetAllStationsAsync(route, direction);

            switch (sort)
            {
                case StationSort.Ridership:
                    return Ok(stations.OrderByDescending(s => s.AverageWeekdayBoardings ?? -1)); // no data sorts last

                case StationSort.Line when route is null:
                    ModelState.AddModelError("sort", "sort=line requires a route.");
                    return ValidationProblem(); // 400 with the message above

                case StationSort.Line:
                    // MBTA lists a route's stops in the order trains visit them. Number each stop by its place in
                    // that list, then sort our stations by that number (anything MBTA didn't list goes last).
                    var lineOrder = await mbta.GetStopDtosAsync(route, direction);
                    var position = lineOrder.Select((stop, i) => (stop.Id, i)).ToDictionary(x => x.Id, x => x.i);
                    return Ok(stations.OrderBy(s => position.GetValueOrDefault(s.MbtaStopId, int.MaxValue)));

                default:
                    return Ok(stations);
            }
        }

        // GET /stations/place-pktrm
        [HttpGet("{mbtaStopId}")]
        public async Task<ActionResult<Station>> GetById(string mbtaStopId)
        {
            var station = await _lookup.GetByMbtaStopIdAsync(mbtaStopId);
            return station is null ? NotFound() : station;
        }

        // GET /stations/place-pktrm/predictions?route=Red&direction=0, ?bus=true to include its buses, and
        // ?schedules=true to fill in timetable times where nothing is predicted.
        // Flow: find the station in our database (404 if unknown) -> ask MBTA for its upcoming trains (cached
        // 10 seconds) -> reshape, filter, and sort them for the app.
        [HttpGet("{mbtaStopId}/predictions")]
        public async Task<ActionResult<IEnumerable<PredictionResponse>>> GetPredictions(
            string mbtaStopId,
            [FromServices] IMbtaClient mbta,
            [FromQuery, RegularExpression(StationRoutes.RouteIdPattern)] string? route,
            [FromQuery, Range(0, 1)] int? direction,
            [FromQuery] bool bus = false,
            [FromQuery] bool schedules = false)
        {
            var station = await _lookup.GetByMbtaStopIdAsync(mbtaStopId);
            if (station is null)
            {
                return NotFound();
            }

            // Subway lines always. Buses too when asked (older app versions don't ask, and know nothing about buses),
            // at a bus-only stop, or for one of this stop's bus routes (a bus commute).
            var withBuses = bus || station.RouteId == "" || (route is not null && station.ServesBus(route));
            var routeIds = string.Join(",", station.SubwayRouteIds().Concat(withBuses ? station.BusRouteIds() : []));
            if (routeIds == "") return Ok(Array.Empty<PredictionResponse>());

            // Fetch all of those routes, then filter below: that way every route/direction combination for this
            // station shares one cached MBTA response.
            var predictions = (await mbta.GetPredictionsAsync(station.MbtaStopId, routeIds))
                // No departure: the train ends here (nothing to board) or skips this stop.
                .Where(p => p.Attributes.DepartureTime is not null)
                .Select(p => new PredictionResponse(p.Relationships.Route.Data.Id, p.Attributes.DirectionId, p.Attributes.DepartureTime!.Value))
                .ToList();

            // Where MBTA predicts nothing for a route one way (late at night, an infrequent bus), its next three trips
            // from the timetable, marked as scheduled. Never mixed with live times for the same route and direction.
            if (schedules)
            {
                var predicted = predictions.Select(p => (p.RouteId, p.DirectionId)).ToHashSet();
                predictions.AddRange((await mbta.GetSchedulesAsync(station.MbtaStopId, routeIds))
                    .Where(s => !predicted.Contains((s.RouteId, s.DirectionId)))
                    .GroupBy(s => (s.RouteId, s.DirectionId))
                    .SelectMany(g => g.Take(3))
                    .Select(s => new PredictionResponse(s.RouteId, s.DirectionId, s.DepartureTime, Scheduled: true)));
            }

            return Ok(predictions
                .Where(p => route is null || p.RouteId == route)
                .Where(p => direction is null || p.DirectionId == direction)
                .OrderBy(p => p.DepartureTime));
        }
    }

    public enum StationSort
    {
        Name,
        Line,      // MBTA's order along the route; requires a route
        Ridership  // busiest first; stations without data last
    }

    // Scheduled: a timetable time, not a live prediction. Left out of the JSON when false, so apps that never ask for
    // schedules get exactly the answers they always have.
    public record PredictionResponse(
        string RouteId, int DirectionId, DateTimeOffset DepartureTime,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] bool Scheduled = false);
}
