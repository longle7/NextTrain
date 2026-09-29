using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Api.Services;
using NextTrain.Core.Services;

var builder = WebApplication.CreateBuilder(args);

// DbContext
builder.Services.AddDbContext<NextTrainDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// HttpClient for MBTA
builder.Services.AddHttpClient<IMbtaClient, MbtaClient>();

// Station import service
builder.Services.AddScoped<IStationImportService, StationImportService>();
builder.Services.AddScoped<IStationLookupService, StationLookupService>();

builder.Services.AddControllers();

// Swagger services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

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