using System;
using System.Collections.Generic;
using System.Text;

namespace NextTrain.Core.Services
{
    /// <summary>
    /// Absraction over the MBTA API
    /// </summary>
    public interface IMbtaClient
    {
        // Gets the stops served by a single route (e.g., "Red").
        // MBTA only populates the stop's route relationship when filtering by one route.
        Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync(string routeId);
    }
}
