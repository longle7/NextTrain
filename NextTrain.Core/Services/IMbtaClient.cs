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
        // Gets all the stops from the MBTA API
        Task<IReadOnlyList<MbtaStopDto>> GetStopDtosAsync();
    }
}
