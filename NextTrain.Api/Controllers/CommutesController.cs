using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// A user's saved commutes (create, read, update, delete).
    ///
    /// Who is the user? The app makes up a random ID once per device and sends it as the X-User-Id header on
    /// every request. Each endpoint only touches rows with that ID. Someone else's commute answers 404 (not 403),
    /// so nobody can tell whether another user's commute exists.
    /// Saving: creating (POST) first checks the per-user limit; then both POST and PUT run TryApplyAsync, which
    /// validates the request against the database and copies it onto the entity. Any problem returns a 400
    /// listing what's wrong.
    /// ponytail: header is trusted as-is, replace with the authenticated user's ID when login exists.
    /// </summary>
    [ApiController]
    [Route("commutes")]
    public class CommutesController : ControllerBase
    {
        private static readonly string[] ValidDays = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };

        // Far more than anyone commutes; stops a buggy or abusive client from filling the database.
        public const int MaxCommutesPerUser = 20;

        // How long a transfer allows to change platforms when the rider doesn't say.
        public const int DefaultTransferMinutes = 3;

        // The farthest a change may be on foot, straight line: a 5-minute walk at the app's walking speed (geo.ts
        // walkMinutes) is about 320 m, plus a margin so a stop the app offers is never refused here.
        public const double TransferWalkMeters = 400;

        private readonly NextTrainDbContext _db;
        private readonly IMbtaClient _mbta;

        public CommutesController(NextTrainDbContext db, IMbtaClient mbta)
        {
            _db = db;
            _mbta = mbta;
        }

        // GET /commutes
        [HttpGet]
        public async Task<IEnumerable<CommuteResponse>> GetAll([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            var commutes = await _db.UserCommutes
                .Include(c => c.Station)
                .Include(c => c.TransferStation)
                .Include(c => c.TransferFromStation)
                .Where(c => c.UserId == userId)
                .OrderBy(c => c.WindowStartLocal)
                .ToListAsync();

            return commutes.Select(CommuteResponse.From);
        }

        // GET /commutes/5
        [HttpGet("{id:int}")]
        public async Task<ActionResult<CommuteResponse>> GetById(int id, [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            var commute = await FindAsync(id, userId);
            return commute is null ? NotFound() : CommuteResponse.From(commute);
        }

        // POST /commutes
        [HttpPost]
        public async Task<ActionResult<CommuteResponse>> Create(
            CommuteRequest request,
            [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            if (await _db.UserCommutes.CountAsync(c => c.UserId == userId) >= MaxCommutesPerUser)
            {
                ModelState.AddModelError("", $"You can save up to {MaxCommutesPerUser} commutes. Delete one to add another.");
                return ValidationProblem();
            }

            var commute = new UserCommute { UserId = userId };
            if (!await TryApplyAsync(commute, request))
            {
                return ValidationProblem();
            }

            _db.UserCommutes.Add(commute);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = commute.Id }, CommuteResponse.From(commute));
        }

        // PUT /commutes/5
        [HttpPut("{id:int}")]
        public async Task<ActionResult<CommuteResponse>> Update(
            int id,
            CommuteRequest request,
            [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            var commute = await FindAsync(id, userId);
            if (commute is null)
            {
                return NotFound();
            }

            if (!await TryApplyAsync(commute, request))
            {
                return ValidationProblem();
            }

            commute.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return CommuteResponse.From(commute);
        }

        // DELETE /commutes/5
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            var commute = await FindAsync(id, userId);
            if (commute is null)
            {
                return NotFound();
            }

            _db.UserCommutes.Remove(commute);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // Another user's commute is reported as 404, so IDs don't leak.
        private Task<UserCommute?> FindAsync(int id, string userId) =>
            _db.UserCommutes
                .Include(c => c.Station)
                .Include(c => c.TransferStation)
                .Include(c => c.TransferFromStation)
                .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

        // Validates the request against the database and copies it onto the commute.
        // Adds errors to ModelState and returns false when invalid.
        private async Task<bool> TryApplyAsync(UserCommute commute, CommuteRequest request)
        {
            var station = await _db.Stations.FirstOrDefaultAsync(s => s.MbtaStopId == request.MbtaStopId);
            if (station is null)
            {
                ModelState.AddModelError(nameof(request.MbtaStopId), $"Unknown station '{request.MbtaStopId}'.");
            }
            else if (!station.SubwayRouteIds().Contains(request.RouteId) && !station.ServesBus(request.RouteId))
            {
                ModelState.AddModelError(nameof(request.RouteId), $"Route '{request.RouteId}' does not serve {station.Name}.");
            }
            else if (!station.SubwayRouteIds().Contains(request.RouteId) && !station.ServesBus(request.RouteId, request.DirectionId))
            {
                // Each side of the street is its own bus stop, so a bus stop usually serves one direction.
                ModelState.AddModelError(nameof(request.DirectionId), $"That bus doesn't stop at {station.Name} in that direction.");
            }

            if (request.WindowStart >= request.WindowEnd)
            {
                ModelState.AddModelError(nameof(request.WindowEnd), "WindowEnd must be after WindowStart.");
            }

            var days = request.ActiveDays.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (days.Length == 0 || days.Any(d => !ValidDays.Contains(d)))
            {
                ModelState.AddModelError(nameof(request.ActiveDays), "ActiveDays must be a comma-separated list of Mon, Tue, Wed, Thu, Fri, Sat, Sun.");
            }

            var (transfer, transferFrom) = await TryTransferAsync(station, request);

            if (!ModelState.IsValid)
            {
                return false;
            }

            commute.Station = station;
            commute.StationId = station!.Id;
            commute.RouteId = request.RouteId;
            commute.DirectionId = request.DirectionId;
            commute.WindowStartLocal = request.WindowStart.ToTimeSpan();
            commute.WindowEndLocal = request.WindowEnd.ToTimeSpan();
            commute.ActiveDays = string.Join(",", ValidDays.Where(days.Contains)); // normalized Mon..Sun order
            commute.TransferStation = transfer;
            commute.TransferStationId = transfer?.Id;
            commute.TransferRouteId = transfer is null ? null : request.TransferRouteId;
            commute.TransferDirectionId = transfer is null ? null : request.TransferDirectionId;
            commute.TransferMinutes = transfer is null ? null : request.TransferMinutes ?? DefaultTransferMinutes;
            commute.TransferFromStation = transferFrom;
            commute.TransferFromStationId = transferFrom?.Id;
            return true;
        }

        // A change of line partway: where, onto which route, and which way, all or none; and, when it's a short walk to
        // another stop, where the rider gets off the first ride (TransferFromStopId). Where they get off has to come
        // later on the first route than where they board (MBTA's stop order that way), at most a 5-minute walk from
        // the transfer stop, and the second route has to stop there going the chosen way. Returns the transfer stop
        // and the stop they get off at (null when it's the same), or nulls for no transfer (or an invalid one).
        private async Task<(Station? Transfer, Station? From)> TryTransferAsync(Station? boarding, CommuteRequest request)
        {
            if (request.TransferStopId is null && request.TransferRouteId is null && request.TransferDirectionId is null)
            {
                return (null, null);
            }
            if (request.TransferStopId is null || request.TransferRouteId is null || request.TransferDirectionId is null)
            {
                ModelState.AddModelError(nameof(request.TransferStopId), "A transfer needs a station, a route, and a direction.");
                return (null, null);
            }

            var transfer = await _db.Stations.FirstOrDefaultAsync(s => s.MbtaStopId == request.TransferStopId);
            var walks = request.TransferFromStopId is not null && request.TransferFromStopId != request.TransferStopId;
            var from = walks ? await _db.Stations.FirstOrDefaultAsync(s => s.MbtaStopId == request.TransferFromStopId) : null;
            if (transfer is null)
            {
                ModelState.AddModelError(nameof(request.TransferStopId), $"Unknown station '{request.TransferStopId}'.");
            }
            else if (walks && from is null)
            {
                ModelState.AddModelError(nameof(request.TransferFromStopId), $"Unknown station '{request.TransferFromStopId}'.");
            }
            else if (from is not null && StationRoutes.Meters(from.Latitude, from.Longitude, transfer.Latitude, transfer.Longitude) > TransferWalkMeters)
            {
                ModelState.AddModelError(nameof(request.TransferFromStopId), $"{transfer.Name} is more than a 5-minute walk from {from.Name}.");
            }
            else if (request.TransferRouteId == request.RouteId)
            {
                ModelState.AddModelError(nameof(request.TransferRouteId), "A transfer is onto a different route.");
            }
            else if (!transfer.SubwayRouteIds().Contains(request.TransferRouteId) && !transfer.ServesBus(request.TransferRouteId, request.TransferDirectionId))
            {
                ModelState.AddModelError(nameof(request.TransferRouteId), $"Route '{request.TransferRouteId}' doesn't stop at {transfer.Name} that way.");
            }
            else if (boarding is not null && ModelState.IsValid)
            {
                var order = (await _mbta.GetStopDtosAsync(request.RouteId, request.DirectionId)).Select(s => s.Id).ToList();
                var getOff = from ?? transfer; // where the first ride has to stop
                var boardsAt = order.IndexOf(boarding.MbtaStopId);
                if (boardsAt < 0 || order.IndexOf(getOff.MbtaStopId) <= boardsAt)
                {
                    ModelState.AddModelError(from is null ? nameof(request.TransferStopId) : nameof(request.TransferFromStopId),
                        $"{getOff.Name} isn't on that route after {boarding.Name}.");
                }
            }
            return (transfer, from);
        }
    }

    // The Transfer* fields are optional (see TryTransferAsync); apps before 1.3 never send them.
    public record CommuteRequest(
        [Required] string MbtaStopId,
        [Required] string RouteId,
        [Range(0, 1)] int DirectionId,
        TimeOnly WindowStart,
        TimeOnly WindowEnd,
        string ActiveDays = "Mon,Tue,Wed,Thu,Fri",
        [MaxLength(50)] string? TransferStopId = null,
        [RegularExpression(StationRoutes.RouteIdPattern)] string? TransferRouteId = null,
        [Range(0, 1)] int? TransferDirectionId = null,
        [Range(1, 10)] int? TransferMinutes = null,
        [MaxLength(50)] string? TransferFromStopId = null);

    // The Transfer* fields are left out of the JSON for a commute without one, so it reads exactly as before; so is
    // StationLandmark (a bus stop's "Taco Bell") where there's none, as at every subway station. TransferFrom* is where
    // the rider gets off when the change is a walk to another stop; absent when they change where they get off.
    public record CommuteResponse(
        int Id,
        string MbtaStopId,
        string StationName,
        string RouteId,
        int DirectionId,
        TimeOnly WindowStart,
        TimeOnly WindowEnd,
        string ActiveDays,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferStopId = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferStationName = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferRouteId = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TransferDirectionId = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TransferMinutes = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? StationLandmark = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferFromStopId = null,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferFromStationName = null)
    {
        public static CommuteResponse From(UserCommute c) => new(
            c.Id,
            c.Station!.MbtaStopId,
            c.Station.Name,
            c.RouteId,
            c.DirectionId,
            TimeOnly.FromTimeSpan(c.WindowStartLocal),
            TimeOnly.FromTimeSpan(c.WindowEndLocal),
            c.ActiveDays,
            c.TransferStation?.MbtaStopId,
            c.TransferStation?.Name,
            c.TransferRouteId,
            c.TransferDirectionId,
            c.TransferMinutes,
            c.Station.Landmark,
            c.TransferFromStation?.MbtaStopId,
            c.TransferFromStation?.Name);
    }
}
