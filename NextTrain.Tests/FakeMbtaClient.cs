using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// In-memory IMbtaClient: returns whatever the test puts in the dictionaries.
/// </summary>
public class FakeMbtaClient : IMbtaClient
{
    public Dictionary<string, List<MbtaStopDto>> StopsByRoute { get; } = new();

    // Keyed by MBTA stop ID. Set PredictionsError to simulate MBTA being down.
    public Dictionary<string, List<MbtaPredictionDto>> PredictionsByStop { get; } = new();
    public Exception? PredictionsError { get; set; }

    public List<MbtaRouteDto> Routes { get; } = new();

    public Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId) =>
        Task.FromResult<IReadOnlyList<MbtaStopDto>>(StopsByRoute.GetValueOrDefault(routeId) ?? new());

    public Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds) =>
        PredictionsError is not null
            ? Task.FromException<IReadOnlyList<MbtaPredictionDto>>(PredictionsError)
            : Task.FromResult<IReadOnlyList<MbtaPredictionDto>>(PredictionsByStop.GetValueOrDefault(mbtaStopId) ?? new());

    public Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync() =>
        Task.FromResult<IReadOnlyList<MbtaRouteDto>>(Routes);

    // Set VehiclesError to simulate MBTA being down.
    public List<MbtaVehicle> Vehicles { get; } = new();
    public Exception? VehiclesError { get; set; }

    public List<MbtaShape> Shapes { get; } = new();

    public Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync() =>
        VehiclesError is not null
            ? Task.FromException<IReadOnlyList<MbtaVehicle>>(VehiclesError)
            : Task.FromResult<IReadOnlyList<MbtaVehicle>>(Vehicles);

    public Task<IReadOnlyList<MbtaShape>> GetSubwayShapesAsync() =>
        Task.FromResult<IReadOnlyList<MbtaShape>>(Shapes);
}
