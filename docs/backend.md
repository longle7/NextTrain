# How the backend works

A guide for developers new to the NextTrain API. Read this first, then `NextTrain.Api/Program.cs`.

## The big picture

The API sits between the app (web and iPhone) and the MBTA's public API. It does three jobs:

1. **Serves live data** (departures, train positions, alerts) by asking MBTA and caching the answer for a few seconds, so thousands of phones cost the MBTA only a handful of requests.
2. **Stores stations** in SQL Server, because we need to search them, sort them, and join them to commutes. MBTA is the source; we copy from it.
3. **Stores each user's commutes**, keyed by an anonymous ID the app creates on the device.

```
 App (React)                 NextTrain API                             Outside
 ───────────                 ─────────────                             ───────
 fetch /api/...  ──HTTP──▶  Controller ──▶ IMbtaClient ──(cache miss)──▶ MBTA V3 API
                                   │            └─ IMemoryCache (seconds to an hour)
                                   └──▶ StationLookupService / DbContext ──▶ SQL Server
```

## Projects

| Project | What's in it |
|---|---|
| `NextTrain.Core` | Plain C# with no web or database code: domain entities (`Domain/`), the service interfaces, and the DTO classes that mirror MBTA's JSON (`Services/`). |
| `NextTrain.Api` | The ASP.NET app: `Program.cs` (startup), `Controllers/` (endpoints), `Services/` (the MBTA client, station import, lookup, background refresh), `Data/` (EF Core `DbContext`), and `Migrations/` (generated schema changes; don't edit them by hand). |
| `NextTrain.Tests` | xUnit tests. Endpoint tests run the real API in memory against a real SQL Server test database, with MBTA replaced by `FakeMbtaClient`. |

## Three flows to know

**1. Live data: `GET /stations/place-pktrm/predictions`**

1. `StationsController.GetPredictions` looks up the station in SQL Server (via `StationLookupService`) and returns 404 if it's unknown.
2. It asks `IMbtaClient.GetPredictionsAsync`. `MbtaClient` checks `IMemoryCache` first, and only calls MBTA over HTTP when the cached copy is older than 10 seconds.
3. The controller reshapes MBTA's JSON into a small `PredictionResponse` list, filters it, and sorts it.
4. If MBTA fails, `HttpClient` throws. `MbtaUnavailableFilter` catches that for every endpoint and answers **503**, and the app shows "MBTA live data is temporarily unavailable".

Vehicles, alerts, routes, and shapes work the same way. Each is a thin controller over one `IMbtaClient` method.

**2. Stations: getting them into the database**

- `StationRefreshService` is a background job. When the API starts, and every 24 hours after, it calls `StationImportService.ImportStationsAsync`.
- The import asks MBTA for each subway route's stops, merges transfer stations (Park Street is on Red and Green), adds ridership and wheelchair accessibility, and inserts or updates rows. It never deletes.
- If MBTA is down, the job logs a warning and retries in 5 minutes. It never crashes the API.

**3. Commutes: per-user data**

- The app sends an `X-User-Id` header (a random ID it created and stored on the device). `CommutesController` only ever reads or writes rows with that user's ID, and another user's commute is a 404.
- `TryApplyAsync` validates a commute against the database (the station must exist and serve the line, and the time window and days must make sense) before saving.
- `DELETE /me` (`MeController`) deletes everything stored for that ID. It's the app's "Delete my data".

## Caching at a glance

All caching happens in `MbtaClient.GetCachedAsync`, keyed by MBTA URL.

| Data | Cached for | Why |
|---|---|---|
| Predictions, vehicles | 10 seconds | Matches the app's refresh rate |
| Alerts | 1 minute | They change over minutes |
| Routes, line order, shapes | 1 hour | Almost never change |

Failures are never cached, so the next request tries MBTA again.

## Errors

- Validation problems return **400** with a message per field (the app shows the first one).
- Unknown IDs and paths return **404**.
- MBTA down or slow returns **503** (`MbtaUnavailableFilter`).
- A bug returns **500**, without internals outside Development.
- Every error body is RFC 9457 "problem JSON".

## Adding an endpoint

1. Add a method to a controller in `Controllers/` (or a new `[ApiController]` class). Take services as constructor or `[FromServices]` parameters.
2. If it needs MBTA data, add a method to `IMbtaClient` and `MbtaClient` using `GetCachedAsync` with a sensible cache time, and add it to `FakeMbtaClient` for tests. Don't add a try/catch: the filter handles MBTA failures.
3. Add a test in `NextTrain.Tests`: an endpoint test for the HTTP behavior, and an `MbtaClientTests` case if you parse new MBTA JSON.
4. Add it to the README's endpoint table.

## Running it

```
dotnet run --project NextTrain.Api     # http://localhost:5112, Swagger at /swagger; stations import themselves
dotnet test                            # needs SQL Server on localhost (see README)
```
