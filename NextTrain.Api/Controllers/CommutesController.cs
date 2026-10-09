using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Domain;

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

        private readonly NextTrainDbContext _db;

        public CommutesController(NextTrainDbContext db)
        {
            _db = db;
        }

        // GET /commutes
        [HttpGet]
        public async Task<IEnumerable<CommuteResponse>> GetAll([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            var commutes = await _db.UserCommutes
                .Include(c => c.Station)
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
            return true;
        }
    }

    public record CommuteRequest(
        [Required] string MbtaStopId,
        [Required] string RouteId,
        [Range(0, 1)] int DirectionId,
        TimeOnly WindowStart,
        TimeOnly WindowEnd,
        string ActiveDays = "Mon,Tue,Wed,Thu,Fri");

    public record CommuteResponse(
        int Id,
        string MbtaStopId,
        string StationName,
        string RouteId,
        int DirectionId,
        TimeOnly WindowStart,
        TimeOnly WindowEnd,
        string ActiveDays)
    {
        public static CommuteResponse From(UserCommute c) => new(
            c.Id,
            c.Station!.MbtaStopId,
            c.Station.Name,
            c.RouteId,
            c.DirectionId,
            TimeOnly.FromTimeSpan(c.WindowStartLocal),
            TimeOnly.FromTimeSpan(c.WindowEndLocal),
            c.ActiveDays);
    }
}
