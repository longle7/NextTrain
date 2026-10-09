using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Every bus stop, at once and compactly (about 7,000), so the app can search them and find the ones near you
    /// on the device: your location never leaves the phone, so the app can't ask the server what's nearby.
    /// Subway stations, including the ones buses stop at, come from /stations.
    /// </summary>
    [ApiController]
    [Route("bus-stops")]
    public class BusStopsController : ControllerBase
    {
        // GET /bus-stops. Stops change at most daily: kept in memory for 10 minutes here, and an hour in the app.
        [HttpGet]
        public async Task<IReadOnlyList<BusStopResponse>> GetAll([FromServices] StationLookupService lookup, [FromServices] IMemoryCache cache)
        {
            Response.Headers.CacheControl = "public, max-age=3600";
            return await cache.GetOrCreateAsync("bus-stops", async entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
                return (await lookup.GetBusStopsAsync()).Select(BusStopResponse.From).ToList();
            }) ?? [];
        }
    }

    // BusRoutes: "route:direction" pairs, e.g. "1:0,741:1". Coordinates to 5 decimals (about a meter).
    public record BusStopResponse(string MbtaStopId, string Name, double Latitude, double Longitude, string BusRoutes, bool? IsAccessible)
    {
        public static BusStopResponse From(Station s) =>
            new(s.MbtaStopId, s.Name, Math.Round(s.Latitude, 5), Math.Round(s.Longitude, 5), s.BusRoutes ?? "", s.IsAccessible);
    }
}
