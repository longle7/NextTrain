using NextTrain.Core.Domain;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// What serves a stop: its subway lines (Station.RouteId, "Orange,Red") and bus routes (Station.BusRoutes,
    /// "route:direction" pairs such as "1:0,741:1").
    /// </summary>
    public static class StationRoutes
    {
        // MBTA route IDs: "Red", "Green-B", "1", "741". Checked before they go into MBTA URLs.
        public const string RouteIdPattern = "^[A-Za-z0-9-]{1,20}$";
        public const string RouteIdListPattern = "^[A-Za-z0-9-]{1,20}(,[A-Za-z0-9-]{1,20}){0,19}$";

        public static string[] SubwayRouteIds(this Station s) => s.RouteId.Split(',', StringSplitOptions.RemoveEmptyEntries);

        // "1:0,1:1,741:1" -> ["1", "741"]
        public static string[] BusRouteIds(this Station s) =>
            (s.BusRoutes ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Split(':')[0]).Distinct().ToArray();

        // Whether the bus route stops here: in any direction, or in the given one.
        public static bool ServesBus(this Station s, string routeId, int? directionId = null) =>
            (s.BusRoutes ?? "").Split(',').Any(p => directionId is null ? p.StartsWith(routeId + ":") : p == $"{routeId}:{directionId}");
    }
}
