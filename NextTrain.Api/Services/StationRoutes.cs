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

        // MBTA stop IDs: "place-pktrm", "66", "door-dwnxg-101arch". Same reason.
        private const string StopId = "[A-Za-z0-9._-]{1,50}";
        public const string StopIdPattern = "^" + StopId + "$";

        // Stops and the minutes' walk to each (GET /trips): "1308:4,place-cool:7", up to 8 stops, 0-15 minutes each.
        private const string StopWalk = StopId + ":(1[0-5]|[0-9])";
        public const string StopWalkListPattern = "^" + StopWalk + "(," + StopWalk + "){0,7}$";

        public static string[] SubwayRouteIds(this Station s) => s.RouteId.Split(',', StringSplitOptions.RemoveEmptyEntries);

        // "1:0,1:1,741:1" -> ["1", "741"]
        public static string[] BusRouteIds(this Station s) =>
            (s.BusRoutes ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Split(':')[0]).Distinct().ToArray();

        // Whether the bus route stops here: in any direction, or in the given one.
        public static bool ServesBus(this Station s, string routeId, int? directionId = null) =>
            (s.BusRoutes ?? "").Split(',').Any(p => directionId is null ? p.StartsWith(routeId + ":") : p == $"{routeId}:{directionId}");
    }
}
