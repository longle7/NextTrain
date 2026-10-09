using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Subway lines and bus routes: names, colors, direction labels, and the streets or track each one runs on.
    /// Thin layers over IMbtaClient, which fetches from MBTA and caches for an hour.
    /// If MBTA is down, MbtaUnavailableFilter turns the error into a 503.
    /// </summary>
    [ApiController]
    [Route("routes")]
    public class RoutesController : ControllerBase
    {
        // GET /routes: the subway lines (what older app versions expect). ?type=bus: bus routes; ?type=all: both,
        // subway first. Each in MBTA's display order, reshaped from MBTA's format into what the app needs.
        [HttpGet]
        public async Task<IEnumerable<RouteResponse>> GetAll([FromServices] IMbtaClient mbta, [FromQuery] RouteKind type = RouteKind.Subway)
        {
            var subway = type is RouteKind.Subway or RouteKind.All ? await mbta.GetSubwayRoutesAsync() : [];
            var bus = type is RouteKind.Bus or RouteKind.All ? await mbta.GetBusRoutesAsync() : [];
            return subway.Concat(bus).Select(RouteResponse.From);
        }

        // GET /routes/shapes: each subway line's track as an encoded polyline, drawn on the map.
        [HttpGet("shapes")]
        public Task<IReadOnlyList<MbtaShape>> GetShapes([FromServices] IMbtaClient mbta) => mbta.GetSubwayShapesAsync();

        // GET /routes/1/shapes: one route's streets (or track), both directions, for the map.
        [HttpGet("{routeId}/shapes")]
        public Task<IReadOnlyList<MbtaShape>> GetRouteShapes([RegularExpression(StationRoutes.RouteIdPattern)] string routeId, [FromServices] IMbtaClient mbta) =>
            mbta.GetRouteShapesAsync(routeId);
    }

    public enum RouteKind { Subway, Bus, All }

    // Direction lists are indexed by direction ID (0 or 1). Type is "subway" or "bus". ShortName is what riders call
    // a bus route ("1", "SL1"; its Id is MBTA's, e.g. "741"); for the subway it's "" or a branch letter ("B").
    public record RouteResponse(
        string Id,
        string Name,
        string Color,
        string TextColor,
        IReadOnlyList<string> DirectionNames,
        IReadOnlyList<string> DirectionDestinations,
        string Type,
        string ShortName)
    {
        public static RouteResponse From(MbtaRouteDto r) => new(
            r.Id,
            r.Attributes.LongName,
            "#" + r.Attributes.Color,     // MBTA sends "DA291C"; CSS wants "#DA291C"
            "#" + r.Attributes.TextColor,
            r.Attributes.DirectionNames,
            r.Attributes.DirectionDestinations,
            r.Attributes.Type == 3 ? "bus" : "subway",
            r.Attributes.ShortName);
    }
}
