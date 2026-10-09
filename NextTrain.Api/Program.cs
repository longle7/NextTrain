using System.IO.Compression;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Controllers;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Services;
using Polly;

// NextTrain API: the entry point. It runs top to bottom once, when the API starts.
//
//   1. Register services ("dependency injection"): everything a controller asks for in its constructor or with
//      [FromServices] is set up here: the database, the MBTA client and its cache, station import and lookup,
//      and the background station refresh.
//   2. Build the app, apply database migrations, and set up the middleware pipeline. Middleware runs in the
//      order it's added, for every request.
//   3. app.Run() starts listening for HTTP requests.
//
// How one request flows, e.g. GET /stations/place-pktrm/predictions:
//   forwarded IP -> compression -> error handling -> CORS -> rate limit -> routing -> StationsController.GetPredictions
//     -> StationLookupService reads the station from SQL Server
//     -> IMbtaClient returns the cached departures, or fetches them from MBTA and caches them for 10 seconds
//   -> the controller's return value is serialized to JSON. If MBTA fails, MbtaUnavailableFilter answers 503.
// See docs/backend.md for the bigger picture.

var builder = WebApplication.CreateBuilder(args);

// ---- 1. Services -------------------------------------------------------------------------------------------

// Database: EF Core over SQL Server. One NextTrainDbContext per request ("scoped").
// EnableRetryOnFailure retries the brief connection drops Azure SQL has during maintenance, instead of failing.
builder.Services.AddDbContext<NextTrainDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure()));

// MBTA client: an HttpClient that gives up after 10 seconds and retries brief failures (5xx, 408, network)
// twice with a short backoff. 429 "too many requests" isn't retried: the in-memory cache keeps us under the limit.
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IMbtaClient, MbtaClient>(client => client.Timeout = TimeSpan.FromSeconds(10))
    .AddTransientHttpErrorPolicy(policy =>
        policy.WaitAndRetryAsync(2, attempt => TimeSpan.FromMilliseconds(300 * attempt)));

// Stations: importing them from MBTA into the database, and reading them back.
builder.Services.AddScoped<IStationImportService, StationImportService>();
builder.Services.AddScoped<StationLookupService>();

// A background job that imports stations at startup and daily (Stations:RefreshHours), so production is never empty.
builder.Services.AddHostedService<StationRefreshService>();

// Controllers handle the HTTP endpoints. MbtaUnavailableFilter turns "MBTA is down" into a 503 for all of them.
builder.Services.AddControllers(options => options.Filters.Add<MbtaUnavailableFilter>());

// The iPhone app runs the web app from capacitor://localhost and calls this API cross-origin.
// Allowed origins come from configuration (Cors:AllowedOrigins); the web app itself is same-origin and needs none.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

// GET /health for the host's health probe: 200 when the database is reachable, 503 when not.
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

// Every error is problem JSON (the app shows its "title" or first "errors" entry): unhandled exceptions become a
// 500 without internals, and bare status codes like 404 get a body.
builder.Services.AddProblemDetails();

// Compress responses: the map polls /vehicles every 10 seconds and the station and shape lists are tens of KB,
// all over mobile data. Safe over HTTPS: no response carries a secret for a BREACH-style attack to extract.
// "Optimal" (Brotli quality 4) instead of the default "Fastest": the bus stop list shrinks from 213 KB to about
// 140 KB for a few milliseconds of work, and small responses barely notice.
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
builder.Services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Optimal);

// The client's real IP. Each proxy in front of the API appends the address it saw to X-Forwarded-For, so with
// Proxy:Hops proxies the client is that many entries from the end, and anything a client wrote before it is ignored.
//   1 (default): only Azure's ingress, which appends the client.
//   2: Cloudflare, then Azure's ingress ("client, cloudflare"). Only safe once the ingress accepts Cloudflare's IPs
//      alone; otherwise a client could skip Cloudflare and pick the IP it's counted as.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
    options.ForwardLimit = builder.Configuration.GetValue("Proxy:Hops", 1);
    options.KnownIPNetworks.Clear(); // the proxies' addresses aren't fixed
    options.KnownProxies.Clear();
});

// Don't advertise the web server ("server: Kestrel") to scanners.
builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

// Rate limit per client IP (RateLimit:PerMinute): one misbehaving client or script can't run up the hosting bill or
// use up the MBTA key's quota for everyone. The app makes about 20 requests a minute, so the default leaves room for
// many people behind one address (an office, a phone carrier). /health is exempt so the host's probe never fails.
// ponytail: fixed window per IPv6 address, not per /64; limit by prefix if someone rotates addresses to get around it.
var perMinute = builder.Configuration.GetValue("RateLimit:PerMinute", 600);
builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        context.Request.Path.StartsWithSegments("/health")
            ? RateLimitPartition.GetNoLimiter("health")
            : RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) }));
    options.OnRejected = async (rejected, _) =>
    {
        if (rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            rejected.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        await Results.Problem(title: "Too many requests. Wait a minute and try again.", statusCode: StatusCodes.Status429TooManyRequests)
            .ExecuteAsync(rejected.HttpContext);
    };
});

// Swagger: interactive API docs at /swagger (Development only, see below).
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ---- 2. Startup checks and the middleware pipeline ----------------------------------------------------------

// Without a key MBTA allows 20 requests a minute, shared by every user: fine for development, not for release.
if (!app.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(app.Configuration["Mbta:ApiKey"]))
{
    app.Logger.LogWarning("No MBTA API key (Mbta:ApiKey): MBTA allows only 20 requests a minute without one. Get a free key at https://api-v3.mbta.com.");
}

app.UseForwardedHeaders();
app.UseResponseCompression();
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(); // Development keeps the detailed error page
}
app.UseStatusCodePages();

// Apply pending migrations so a fresh database (e.g., in Docker) gets its schema.
// ponytail: migrate on startup, move to a deploy step if multiple instances run at once.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<NextTrainDbContext>().Database.Migrate();
}

// Development only: Swagger, and a manual station import (not mapped at all in other environments).
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();

    // POST /admin/import-stations
    app.MapPost("/admin/import-stations", async (IStationImportService importer) =>
    {
        await importer.ImportStationsAsync();
        return Results.Ok("Stations imported.");
    });
}

app.UseCors(); // before the limiter, so a 429 carries CORS headers and the app can show its message
app.UseRateLimiter();
app.MapHealthChecks("/health");
app.MapControllers(); // every [ApiController] class in Controllers/ becomes a set of endpoints

// ---- 3. Go -------------------------------------------------------------------------------------------------
app.Run();
