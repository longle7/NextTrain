using System.Threading.Tasks;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Imports MBTA stops into the local Stations table.
    /// </summary>
    public interface IStationImportService
    {
        Task ImportStationsAsync();
    }
}