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

// Swagger services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Apply pending migrations so a fresh database (e.g., in Docker) gets its schema.
// ponytail: migrate on startup, move to a deploy step if multiple instances run at once.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<NextTrainDbContext>().Database.Migrate();
}

// Swagger middleware (Development only)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();

// Optional: one-time import endpoint, e.g., GET /admin/import-stations
app.MapGet("/admin/import-stations", async (IStationImportService importer) =>
{
    await importer.ImportStationsAsync();
    return Results.Ok("Stations imported.");
});

app.Run();