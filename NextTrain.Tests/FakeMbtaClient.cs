using NextTrain.Core.Services;

namespace NextTrain.Tests;

/// <summary>
/// In-memory IMbtaClient: returns whatever the test puts in the dictionaries.
/// </summary>
public class FakeMbtaClient : IMbtaClient
{
    public Dictionary<string, List<MbtaStopDto>> StopsByRoute { get; } = new();

    // A route's stops one way (bus routes are imported per direction).
    public Dictionary<(string RouteId, int DirectionId), List<MbtaStopDto>> StopsByRouteDirection { get; } = new();

    // Keyed by MBTA stop ID. Set PredictionsError to simulate MBTA being down.
    public Dictionary<string, List<MbtaPredictionDto>> PredictionsByStop { get; } = new();
    public Exception? PredictionsError { get; set; }

    // The routes each predictions request asked MBTA about, e.g. "Red" or "Red,741".
    public List<string> PredictionRouteRequests { get; } = new();

    public List<MbtaRouteDto> Routes { get; } = new();
    public List<MbtaRouteDto> BusRoutes { get; } = new();

    public Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId, int? directionId = null) =>
        Task.FromResult<IReadOnlyList<MbtaStopDto>>(
            (directionId is null ? StopsByRoute.GetValueOrDefault(routeId) : StopsByRouteDirection.GetValueOrDefault((routeId, directionId.Value))) ?? new());

    public Task<IReadOnlyList<MbtaPredictionDto>> GetPredictionsAsync(string mbtaStopId, string routeIds)
    {
        PredictionRouteRequests.Add(routeIds);
        return PredictionsError is not null
            ? Task.FromException<IReadOnlyList<MbtaPredictionDto>>(PredictionsError)
            : Task.FromResult<IReadOnlyList<MbtaPredictionDto>>(PredictionsByStop.GetValueOrDefault(mbtaStopId) ?? new());
    }

    public Task<IReadOnlyList<MbtaRouteDto>> GetSubwayRoutesAsync() =>
        Task.FromResult<IReadOnlyList<MbtaRouteDto>>(Routes);

    public Task<IReadOnlyList<MbtaRouteDto>> GetBusRoutesAsync() =>
        Task.FromResult<IReadOnlyList<MbtaRouteDto>>(BusRoutes);

    // Set VehiclesError to simulate MBTA being down.
    public List<MbtaVehicle> Vehicles { get; } = new();
    public Exception? VehiclesError { get; set; }

    // Keyed by the route IDs asked for, e.g. "741".
    public Dictionary<string, List<MbtaVehicle>> RouteVehicles { get; } = new();

    public List<MbtaShape> Shapes { get; } = new();
    public Dictionary<string, List<MbtaShape>> RouteShapes { get; } = new();

    public Task<IReadOnlyList<MbtaVehicle>> GetSubwayVehiclesAsync() =>
        VehiclesError is not null
            ? Task.FromException<IReadOnlyList<MbtaVehicle>>(VehiclesError)
            : Task.FromResult<IReadOnlyList<MbtaVehicle>>(Vehicles);

    public Task<IReadOnlyList<MbtaVehicle>> GetRouteVehiclesAsync(string routeIds) =>
        Task.FromResult<IReadOnlyList<MbtaVehicle>>(RouteVehicles.GetValueOrDefault(routeIds) ?? new());

    public Task<IReadOnlyList<MbtaShape>> GetSubwayShapesAsync() =>
        Task.FromResult<IReadOnlyList<MbtaShape>>(Shapes);

    public Task<IReadOnlyList<MbtaShape>> GetRouteShapesAsync(string routeId) =>
        Task.FromResult<IReadOnlyList<MbtaShape>>(RouteShapes.GetValueOrDefault(routeId) ?? new());

    // Set AlertsError to simulate MBTA being down.
    public List<MbtaAlertDto> Alerts { get; } = new();
    public Exception? AlertsError { get; set; }

    // Keyed by the route IDs asked for, e.g. "1,741".
    public Dictionary<string, List<MbtaAlertDto>> RouteAlerts { get; } = new();

    public Task<IReadOnlyList<MbtaAlertDto>> GetSubwayAlertsAsync() =>
        AlertsError is not null
            ? Task.FromException<IReadOnlyList<MbtaAlertDto>>(AlertsError)
            : Task.FromResult<IReadOnlyList<MbtaAlertDto>>(Alerts);

    public Task<IReadOnlyList<MbtaAlertDto>> GetRouteAlertsAsync(string routeIds) =>
        Task.FromResult<IReadOnlyList<MbtaAlertDto>>(RouteAlerts.GetValueOrDefault(routeIds) ?? new());
}
