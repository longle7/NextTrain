# NextTrain

[![CI](https://github.com/longle7/NextTrain/actions/workflows/ci.yml/badge.svg)](https://github.com/longle7/NextTrain/actions/workflows/ci.yml)

REST API for Boston MBTA subway commuters: find the nearest station and see real-time train predictions.

Built with .NET 10, ASP.NET Core, EF Core, and SQL Server, using the [MBTA V3 API](https://api-v3.mbta.com).

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/stations?route=Red` | List stations, optionally filtered by route |
| GET | `/stations/nearest?lat=&lon=&route=` | Nearest station to a location |
| GET | `/stations/{mbtaStopId}` | One station, e.g. `place-pktrm` |
| GET | `/stations/{mbtaStopId}/predictions?route=&direction=` | Upcoming trains, soonest first |
| GET | `/admin/import-stations` | Import subway stations from MBTA |

Routes: `Red`, `Mattapan`, `Orange`, `Blue`, `Green-B`, `Green-C`, `Green-D`, `Green-E`. Direction is `0` or `1`.

## Run with Docker

```
docker compose up --build
curl http://localhost:5080/admin/import-stations
```

API at http://localhost:5080, Swagger at http://localhost:5080/swagger.

## Run locally

Requires the .NET 10 SDK and SQL Server on `localhost` (Windows authentication).

```
dotnet run --project NextTrain.Api
```

API at http://localhost:5112. The database is created on startup.

## MBTA API key

Optional. Without a key MBTA allows 20 requests per minute; with one, 1000. Get a free key at https://api-v3.mbta.com.

```
dotnet user-secrets set "Mbta:ApiKey" "<key>" --project NextTrain.Api   # local
$env:MBTA_API_KEY = "<key>"; docker compose up                           # Docker (PowerShell)
```

## Tests

```
dotnet test
```

Tests run against a real SQL Server database (`NextTrainDb_Tests` on `localhost` by default; override with the `NEXTTRAIN_TEST_DB` connection string). MBTA calls are faked. CI runs the same tests against a SQL Server container on every pull request.

## Project layout

- `NextTrain.Core`: domain entities, service interfaces, MBTA DTOs
- `NextTrain.Api`: controllers, EF Core DbContext and migrations, MBTA client, station import and lookup
- `NextTrain.Tests`: xUnit unit, integration, and HTTP endpoint tests

## Design notes

- Stations are imported per subway route because MBTA only reports a stop's route when filtering by a single route. Transfer stations store all routes, e.g. `Green-B,Green-C,Green-D,Green-E,Red`.
- Predictions are cached in memory for 30 seconds per station. MBTA calls time out after 10 seconds and retry transient failures twice. If MBTA is unavailable the API returns 503.
