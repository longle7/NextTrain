# NextTrain

[![CI](https://github.com/longle7/NextTrain/actions/workflows/ci.yml/badge.svg)](https://github.com/longle7/NextTrain/actions/workflows/ci.yml)

Real-time train times for Boston MBTA subway commuters: browse lines and stations, see live departures, and save commutes.

Built with .NET 10, ASP.NET Core, EF Core, and SQL Server, with a React + TypeScript + Tailwind web app, using the [MBTA V3 API](https://api-v3.mbta.com).

## Web app

Mobile-first, with a bottom tab bar like an iPhone app:

- **Home**: your saved commutes (the one happening now shows live next-train times, and any service alert on it), station search, and the stations nearest you with walking distance.
- **Lines**: each line's status ("Normal service", "Delays", "Suspension", ...), and its stations in line order, A-Z, or by ridership, with its alerts on top.
- **Map**: every line, station, and live train with its direction of travel.
- **Station**: service alerts that affect it, live departures by line and direction, and a button to save it as a commute.
- **Settings** (gear icon): privacy policy, report a problem, version, and **Delete my data**.

Commutes belong to an anonymous ID stored on the device (sent as `X-User-Id`) until sign-in exists. On an iPhone, Safari's **Share → Add to Home Screen** installs it full screen with its own icon.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/routes` | Subway lines with colors and direction destinations |
| GET | `/routes/shapes` | Track of each line as Google encoded polylines (for the map) |
| GET | `/vehicles` | Live train positions, bearing, direction, and current/next stop |
| GET | `/alerts` | Service alerts in effect now (delays, suspensions, station closures), most severe first |
| GET | `/stations?route=Red&sort=line` | List stations, optionally by route; `sort` is `name` (default), `line` (order along the route), or `ridership` |
| GET | `/stations/nearest?lat=&lon=&route=` | Nearest station to a location |
| GET | `/stations/{mbtaStopId}` | One station, e.g. `place-pktrm` |
| GET | `/stations/{mbtaStopId}/predictions?route=&direction=` | Upcoming trains, soonest first |
| GET | `/health` | Health probe for hosting: 200 when the database is reachable, 503 when not |
| POST | `/admin/import-stations` | Import subway stations from MBTA (Development only) |
| GET | `/commutes` | Your saved commutes |
| GET | `/commutes/{id}` | One saved commute |
| POST | `/commutes` | Save a commute |
| PUT | `/commutes/{id}` | Update a commute |
| DELETE | `/commutes/{id}` | Delete a commute |
| DELETE | `/me` | Delete everything stored for this user (the app's "Delete my data") |

Routes: `Red`, `Mattapan`, `Orange`, `Blue`, `Green-B`, `Green-C`, `Green-D`, `Green-E`. Direction is `0` or `1`.

Commute and `/me` endpoints require an `X-User-Id` header (placeholder until authentication is added). Example body:

```json
{ "mbtaStopId": "place-pktrm", "routeId": "Red", "directionId": 0,
  "windowStart": "07:45", "windowEnd": "08:15", "activeDays": "Mon,Tue,Wed,Thu,Fri" }
```

## Run with Docker

```
docker compose up --build
curl -X POST http://localhost:5080/admin/import-stations
```

Web app at http://localhost:5173, API at http://localhost:5080, Swagger at http://localhost:5080/swagger.

## Run locally

Requires the .NET 10 SDK, Node 24, and SQL Server on `localhost` (Windows authentication).

```
dotnet run --project NextTrain.Api        # API at http://localhost:5112, database created on startup
cd NextTrain.Web && npm install && npm run dev   # web app at http://localhost:5173
```

Import stations once with `POST http://localhost:5112/admin/import-stations`. The web dev server forwards `/api/*` to the API.

## MBTA API key

Optional. Without a key MBTA allows 20 requests per minute; with one, 1000. Get a free key at https://api-v3.mbta.com.

```
dotnet user-secrets set "Mbta:ApiKey" "<key>" --project NextTrain.Api   # local
$env:MBTA_API_KEY = "<key>"; docker compose up                           # Docker (PowerShell)
```

## Tests

```
dotnet test
cd NextTrain.Web && npm run lint && npm test && npm run build
```

API tests run against a real SQL Server database (`NextTrainDb_Tests` on `localhost` by default; override with the `NEXTTRAIN_TEST_DB` connection string). MBTA calls are faked. Web tests (Vitest) cover countdowns, departure grouping, commute timing, station search, distance, and polyline decoding. CI runs all of it on every pull request.

## Project layout

- `NextTrain.Core`: domain entities, service interfaces, MBTA DTOs
- `NextTrain.Api`: controllers, EF Core DbContext and migrations, MBTA client, station import and lookup
- `NextTrain.Tests`: xUnit unit, integration, and HTTP endpoint tests
- `NextTrain.Web`: React web app (Vite, Tailwind, React Router); served by nginx in Docker, which proxies `/api` to the API

## Design notes

- Stations are imported per subway route because MBTA only reports a stop's route when filtering by a single route. Transfer stations store all routes, e.g. `Green-B,Green-C,Green-D,Green-E,Red`.
- Ridership is average weekday boardings per station from MassDOT's Fall 2024 counts (embedded snapshot, applied on import). Mattapan stops are not in the dataset.
- Predictions and train positions are cached in memory for 10 seconds, alerts for 1 minute, route info and shapes for 1 hour. MBTA calls time out after 10 seconds and retry transient failures twice. If MBTA is unavailable the API returns 503.
- Errors are always problem JSON (RFC 9457): validation errors list what's wrong, unknown paths and IDs get a 404 body, and unexpected failures return a 500 without internals outside Development. Responses are compressed (Brotli or gzip), which cuts `/stations` from 33 KB to 8 KB and each 10-second `/vehicles` refresh from 15 KB to 4 KB.
- `/alerts` returns every subway alert with the routes, stations, and directions it covers; the app decides what each line, station, and commute shows. A line's status counts alerts of severity 3 and up (MBTA uses 1-2 for things like a closed staircase, which still show on that station's page).
- The live map (`/map`) uses Leaflet with OpenStreetMap tiles, loaded only when the map opens. Line shapes are MBTA's canonical (regular service) patterns. OpenStreetMap's tile servers are for light use; switch to a commercial tile provider before launch.

## Road to the App Store

The web app is built to be wrapped as a native iPhone app with [Capacitor](https://capacitorjs.com).

Ready:

- **App icon**: NextTrain's own mark (not the MBTA's "T", a trademark App Review would flag under guideline 5.2.1). The 1024×1024 App Store icon, with no alpha channel as Apple requires, is `NextTrain.Web/assets/app-store-icon.png`.
- **Privacy policy** at `/privacy` (in the app under Settings); once hosted, that URL is the one App Store Connect asks for. Location never leaves the device and there's no tracking, so the App Privacy answers are short: *User Content* (saved commutes) and *Identifiers → User ID* (the random device ID), both used only for app functionality and not for tracking.
- **In-app data deletion**: Settings → Delete my data calls `DELETE /me`.
- **App Review from outside Boston**: "Near you" and the map say you're outside the MBTA area instead of listing stations 2,700 miles away.

Still to do:

1. **Host the API over HTTPS.** The app side is ready: build the web app with `VITE_API_URL=https://<api-host> npm run build` (it defaults to the relative `/api`), the API already allows the Capacitor origins (`Cors:AllowedOrigins` in `appsettings.json`), and `/health` is there for the host's health probe.
2. **Sign in with Apple** to replace the anonymous device ID (Delete my data already covers Apple's account-deletion rule).
3. **Push notifications** for commutes ("your train leaves in 5 min") via APNs. The `NotificationSubscription` table is ready for it, and it gives the app native value beyond a website (App Review guideline 4.2).
4. **Wrap and ship**: `npm i @capacitor/core @capacitor/ios`, `npx cap add ios`, and build in Xcode on a Mac. Needs an Apple Developer account, a privacy policy URL, and a location usage description (`NSLocationWhenInUseUsageDescription`) for "Near you".
