using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using NextTrain.Api.Data;
using NextTrain.Core.Domain;
using NextTrain.Core.Services;

namespace NextTrain.Api.Services
{
    /// <summary>
    /// Service that imports stops from MBTA into the Stations table.
    /// </summary>
    public class StationImportService : IStationImportService
    {
        private readonly IMbtaClient _mbtaClient;
        private readonly NextTrainDbContext _dbContext;

        public StationImportService(IMbtaClient mbtaClient, NextTrainDbContext dbContext)
        {
            _mbtaClient = mbtaClient;
            _dbContext = dbContext;
        }

        public async Task ImportStationsAsync()
        {
            var stops = await _mbtaClient.GetStopDtosAsync();

            foreach (var stop in stops)
            {
                // Check if station already exists
                var existing = await _dbContext.Stations
                    .FirstOrDefaultAsync(s => s.MbtaStopId == stop.Id);

                if (existing is null)
                {
                    var station = new Station
                    {
                        MbtaStopId = stop.Id,
                        Name = stop.Attributes.Name,
                        Latitude = stop.Attributes.Latitude ?? 0.0,
                        Longitude = stop.Attributes.Longitude ?? 0.0,
                        PlatformCode = stop.Attributes.PlatformCode,
                        RouteId = stop.Relationships?.Route?.Data?.Id ?? string.Empty,
                        CreatedAtUtc = DateTime.UtcNow
                    };

                    _dbContext.Stations.Add(station);
                }
                else
                {
                    // Update basic attributes if they changed
                    existing.Name = stop.Attributes.Name;
                    existing.Latitude = stop.Attributes.Latitude ?? 0.0;
                    existing.Longitude = stop.Attributes.Longitude ?? 0.0;
                    existing.PlatformCode = stop.Attributes.PlatformCode;
                    existing.RouteId = stop.Relationships?.Route?.Data?.Id ?? existing.RouteId;
                    existing.UpdatedAtUtc = DateTime.UtcNow;
                }
            }

            await _dbContext.SaveChangesAsync();
        }
    }
}