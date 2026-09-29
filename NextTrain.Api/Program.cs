using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Services;
using Polly;

var builder = WebApplication.CreateBuilder(args);

// DbContext
builder.Services.AddDbContext<NextTrainDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// HttpClient for MBTA: fail fast, retry transient errors (5xx, 408, network) with backoff.
// 429 is not retried; the prediction cache keeps us under the rate limit.
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IMbtaClient, MbtaClient>(client => client.Timeout = TimeSpan.FromSeconds(10))
    .AddTransientHttpErrorPolicy(policy =>
        policy.WaitAndRetryAsync(2, attempt => TimeSpan.FromMilliseconds(300 * attempt)));

// Station import service
builder.Services.AddScoped<IStationImportService, StationImportService>();
builder.Services.AddScoped<IStationLookupService, StationLookupService>();

builder.Services.AddControllers();

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
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);

// Swagger services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

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

// Development only: Swagger, and the station import (not mapped at all in other environments).
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

app.UseCors();
app.MapHealthChecks("/health");
app.MapControllers();

app.Run();