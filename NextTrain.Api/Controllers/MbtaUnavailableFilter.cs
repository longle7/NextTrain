using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace NextTrain.Api.Controllers
{
    /// <summary>
    /// Turns "MBTA didn't answer" into a clean 503 Service Unavailable for every endpoint, so no controller
    /// needs its own try/catch.
    ///
    /// How it fits in:
    ///   1. A controller calls IMbtaClient, which calls the MBTA API with HttpClient.
    ///   2. If MBTA is down or returns an error, HttpClient throws HttpRequestException.
    ///      If it's too slow, our 10-second timeout (see Program.cs) throws TaskCanceledException.
    ///   3. The exception bubbles out of the controller action. MVC then runs this filter (registered for all
    ///      controllers in Program.cs), which replaces the crash with a 503 problem response.
    ///   4. The app sees 503 and shows "MBTA live data is temporarily unavailable" instead of a generic error.
    /// Any other exception is a real bug: we leave it alone so it's logged and returned as a 500.
    /// </summary>
    public class MbtaUnavailableFilter : IExceptionFilter
    {
        private readonly ProblemDetailsFactory _problems;
        private readonly ILogger<MbtaUnavailableFilter> _log;

        // ProblemDetailsFactory builds the same JSON error shape ASP.NET uses everywhere (type, title, status, traceId).
        public MbtaUnavailableFilter(ProblemDetailsFactory problems, ILogger<MbtaUnavailableFilter> log)
        {
            _problems = problems;
            _log = log;
        }

        public void OnException(ExceptionContext context)
        {
            if (context.Exception is not (HttpRequestException or TaskCanceledException)) return;

            // One line, no stack trace: during an MBTA outage every request lands here, and the production logs
            // (warnings and up, capped per day) should show the outage, not fill up with it.
            _log.LogWarning("MBTA unavailable for {Path}: {Error}", context.HttpContext.Request.Path, context.Exception.Message);

            var problem = _problems.CreateProblemDetails(
                context.HttpContext,
                StatusCodes.Status503ServiceUnavailable,
                detail: "MBTA live data is temporarily unavailable. Please try again in a moment.");
            context.Result = new ObjectResult(problem) { StatusCode = problem.Status };
            context.ExceptionHandled = true; // tells MVC we answered; don't treat it as a crash
        }
    }
}
