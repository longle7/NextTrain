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

        // DELETE /me/push-token: the app's notifications switch, off.
        [HttpDelete("push-token")]
        public async Task<IActionResult> RemovePushTokens([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            await _db.PushDevices.Where(d => d.UserId == userId).ExecuteDeleteAsync();
            return NoContent();
        }
    }

    // Apple's device tokens are hex (64 characters today; Apple says they may grow).
    public record PushTokenRequest([Required, RegularExpression("^[0-9a-fA-F]{64,200}$")] string Token);
}
