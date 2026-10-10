using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Subway service alerts in effect now. The app decides which lines, stations, and commutes each one affects.
    /// </summary>
    [ApiController]
    [Route("alerts")]
    public class AlertsController : ControllerBase
    {
        // GET /alerts: every subway alert in effect now, most severe first. We send them all (one cached response
        // for everyone); the app picks the ones that match each line, station, and commute (see alerts.ts).
        // ?routes=1,741: those routes' alerts instead (bus detours, ...); there are too many bus alerts to send all.
        [HttpGet]
        public async Task<IEnumerable<AlertResponse>> GetAll(
            [FromServices] IMbtaClient mbta,
            [FromQuery, RegularExpression(StationRoutes.RouteIdListPattern)] string? routes)
        {
            var alerts = routes is null ? await mbta.GetSubwayAlertsAsync() : await mbta.GetRouteAlertsAsync(routes);
            return alerts.OrderByDescending(a => a.Attributes.Severity).Select(a => AlertResponse.From(a));
        }

        // How far ahead planned changes are shown: enough to plan around a weekend, not so far it's noise.
        public static readonly TimeSpan UpcomingWindow = TimeSpan.FromDays(14);

        // GET /alerts/upcoming: planned subway changes starting within two weeks (shuttles, closures, single tracking),
        // soonest first, each with when it starts and ends. ?routes=1,741: those routes' instead.
        [HttpGet("upcoming")]
        public async Task<IEnumerable<AlertResponse>> GetUpcoming(
            [FromServices] IMbtaClient mbta,
            [FromQuery, RegularExpression(StationRoutes.RouteIdListPattern)] string? routes)
        {
            var now = DateTimeOffset.UtcNow;
            return (await mbta.GetUpcomingAlertsAsync(routes))
                // An alert can repeat (every weekend): the next time it starts.
                .Select(a => (Alert: a, Next: a.Attributes.ActivePeriod.Where(p => p.Start > now).MinBy(p => p.Start)))
                .Where(x => x.Next is not null && x.Next.Start <= now + UpcomingWindow)
                .OrderBy(x => x.Next!.Start)
                .Select(x => AlertResponse.From(x.Alert, x.Next));
        }
    }

    // Severity is 0 (information) to 10 (worst). Summary is short ("Symphony closed"); Header is a sentence or two.
    // Start and End (planned changes only) are when it next applies; they're left out of the JSON otherwise, so the
    // alerts every app version reads look exactly as before.
    public record AlertResponse(
        string Id,
        string Effect,
        int Severity,
        string Summary,
        string Header,
        string? Description,
        string? Timeframe,
        string? Url,
        IReadOnlyList<AlertEntity> Entities,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? Start = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? End = null)
    {
        public static AlertResponse From(MbtaAlertDto a, MbtaActivePeriodDto? period = null) => new(
            a.Id,
            a.Attributes.Effect,
            a.Attributes.Severity,
            string.IsNullOrWhiteSpace(a.Attributes.ServiceEffect) ? a.Attributes.Header : a.Attributes.ServiceEffect,
            a.Attributes.Header,
            a.Attributes.Description,
            a.Attributes.Timeframe,
            a.Attributes.Url,
            // MBTA repeats route/stop pairs once per activity; one of each is enough.
            a.Attributes.InformedEntity.Select(e => new AlertEntity(e.Route, e.Stop, e.DirectionId)).Distinct().ToList(),
            period?.Start,
            period?.End);
    }

    // Null means "all": no RouteId is every route, no StopId is the whole route, no DirectionId is both directions.
    public record AlertEntity(string? RouteId, string? StopId, int? DirectionId);
}
