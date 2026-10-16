using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Everything stored for the current user, identified by the X-User-Id header.
    /// ponytail: header is trusted as-is, replace with the authenticated user's ID when login exists.
    /// </summary>
    [ApiController]
    [Route("me")]
    public class MeController : ControllerBase
    {
        private readonly NextTrainDbContext _db;

        public MeController(NextTrainDbContext db)
        {
            _db = db;
        }

        // DELETE /me: the app's "Delete my data" (the App Store requires in-app deletion of a user's data): commutes,
        // the phones that get notifications, and which notifications were sent.
        [HttpDelete]
        public async Task<IActionResult> Delete([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            await _db.UserCommutes.Where(c => c.UserId == userId).ExecuteDeleteAsync();
            await _db.PushDevices.Where(d => d.UserId == userId).ExecuteDeleteAsync();
            await _db.SentNotifications.Where(n => n.UserId == userId).ExecuteDeleteAsync();
            await _db.LiveActivityTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync();
            return NoContent();
        }

        // PUT /me/push-token {token}: this phone gets delay notifications for this user's commutes (see DelayNotifier).
        // The app sends its token at every launch (iOS can change it). One phone per user ID, since each install makes
        // its own ID; a token still under an earlier ID (iOS cleared the app's storage) moves here.
        [HttpPut("push-token")]
        public async Task<IActionResult> RegisterPushToken(
            [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId,
            PushTokenRequest request)
        {
            await _db.PushDevices.Where(d => d.Token == request.Token && d.UserId != userId).ExecuteDeleteAsync();
            var device = await _db.PushDevices.FirstOrDefaultAsync(d => d.UserId == userId);
            if (device is null)
            {
                _db.PushDevices.Add(new PushDevice { UserId = userId, Token = request.Token });
            }
            else
            {
                device.Token = request.Token;
                device.LastSeenAtUtc = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // PUT /me/live-activity {commuteId, token, endsAt}: keep this commute's Live Activity up to date with the app
        // closed (LiveActivityUpdater), until endsAt. Replaces the user's earlier one: one shows at a time.
        [HttpPut("live-activity")]
        public async Task<IActionResult> RegisterLiveActivity(
            [FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId,
            LiveActivityRequest request)
        {
            if (!await _db.UserCommutes.AnyAsync(c => c.Id == request.CommuteId && c.UserId == userId)) return NotFound();
            var endsAt = DateTimeOffset.FromUnixTimeSeconds(request.EndsAt).UtcDateTime;
            if (endsAt <= DateTime.UtcNow || endsAt > DateTime.UtcNow.AddHours(24))
            {
                ModelState.AddModelError(nameof(request.EndsAt), "The commute window must end within the next day.");
                return ValidationProblem();
            }
            await _db.LiveActivityTokens.Where(t => t.UserId == userId || t.Token == request.Token).ExecuteDeleteAsync();
            _db.LiveActivityTokens.Add(new LiveActivityToken { UserId = userId, CommuteId = request.CommuteId, Token = request.Token, EndsAtUtc = endsAt });
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // DELETE /me/live-activity: the app ended its Live Activity; stop updating it.
        [HttpDelete("live-activity")]
        public async Task<IActionResult> RemoveLiveActivity([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            await _db.LiveActivityTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync();
            return NoContent();
        }

        // DELETE /me/push-token: the app's notifications switch, off.
        [HttpDelete("push-token")]
        public async Task<IActionResult> RemovePushTokens([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            await _db.PushDevices.Where(d => d.UserId == userId).ExecuteDeleteAsync();
            return NoContent();
        }
    }

    // Live Activity push tokens are hex too, and longer. EndsAt is Unix seconds: when the commute window ends.
    public record LiveActivityRequest(int CommuteId, [Required, RegularExpression("^[0-9a-fA-F]{64,400}$")] string Token, long EndsAt);

    // Apple's device tokens are hex (64 characters today; Apple says they may grow).
    public record PushTokenRequest([Required, RegularExpression("^[0-9a-fA-F]{64,200}$")] string Token);
}
