using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;

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

        // DELETE /me: the app's "Delete my data" (the App Store requires in-app deletion of a user's data).
        [HttpDelete]
        public async Task<IActionResult> Delete([FromHeader(Name = "X-User-Id"), Required, MaxLength(100)] string userId)
        {
            await _db.UserCommutes.Where(c => c.UserId == userId).ExecuteDeleteAsync();
            await _db.NotificationSubscriptions.Where(s => s.UserId == userId).ExecuteDeleteAsync();
            await _db.UserLocationPreferences.Where(p => p.UserId == userId).ExecuteDeleteAsync();
            return NoContent();
        }
    }
}
