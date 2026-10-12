using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Error reports from the app (the Privacy Policy's "Error reports"): what went wrong and on which page, so problems
    /// testers and riders hit show up in the logs. No user ID, location, or IP address is recorded.
    /// </summary>
    [ApiController]
    [Route("client-errors")]
    public class ClientErrorsController : ControllerBase
    {
        private readonly ILogger<ClientErrorsController> _logger;

        public ClientErrorsController(ILogger<ClientErrorsController> logger)
        {
            _logger = logger;
        }

        // POST /client-errors {message, stack?, page?, version?, platform?}: logged as one warning line (line breaks
        // flattened, so a report can't forge extra log lines).
        [HttpPost]
        [EnableRateLimiting("client-errors")]
        [RequestSizeLimit(16_384)]
        public IActionResult Report(ClientErrorReport report)
        {
            static string? Line(string? s) => s?.ReplaceLineEndings(" | ");
            var from = string.Join(" ", new[] { report.Platform, report.Version }.Where(s => !string.IsNullOrWhiteSpace(s))); // "ios 1.3 (9)"
            _logger.LogWarning("App error on {Page} ({From}): {Message} || {Stack}",
                Line(report.Page), Line(from), Line(report.Message), Line(report.Stack));
            return NoContent();
        }
    }

    // Page is a path only ("/stations/place-pktrm"): never a query string, which could carry more than the page.
    public record ClientErrorReport(
        [Required, MaxLength(500)] string Message,
        [MaxLength(4000)] string? Stack = null,
        [MaxLength(200), RegularExpression("^/[^?#]*$")] string? Page = null,
        [MaxLength(40)] string? Version = null,
        [MaxLength(20)] string? Platform = null);
}
