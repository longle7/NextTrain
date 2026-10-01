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
- **Settings** (gear icon): **Delete my data**, the analytics choice (website only), the Privacy Policy, Terms of Use, and Cookie Policy, report a problem, and version.
- **Legal and consent**: `/privacy`, `/terms`, `/cookies`. Google Analytics runs only on the website, only when `GA_MEASUREMENT_ID` is set, and only after the visitor chooses Allow in the cookie notice; Global Privacy Control and Do Not Track mean no. See [docs/legal.md](docs/legal.md).

Commutes belong to an anonymous ID stored on the device (sent as `X-User-Id`) until sign-in exists. On an iPhone, Safari's **Share → Add to Home Screen** installs it full screen with its own icon.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/routes` | Subway lines with colors and direction destinations |
| GET | `/routes/shapes` | Track of each line as Google encoded polylines (for the map) |
| GET | `/vehicles` | Live train positions, bearing, direction, and current/next stop |
| GET | `/alerts` | Service alerts in effect now (delays, suspensions, station closures), most severe first |
| GET | `/stations?route=Red&sort=line` | List stations, optionally by route; `sort` is `name` (default), `line` (order along the route), or `ridership` |
| GET | `/stations/{mbtaStopId}` | One station, e.g. `place-pktrm` |
| GET | `/stations/{mbtaStopId}/predictions?route=&direction=` | Upcoming trains, soonest first |
| GET | `/mapkit/token` | A short-lived Apple Maps (MapKit JS) token for the calling site; 404 until `MapKit:TeamId`, `MapKit:KeyId`, and `MapKit:PrivateKey` are set |
| GET | `/health` | Health probe for hosting: 200 when the database is reachable, 503 when not |
| POST | `/admin/import-stations` | Re-import subway stations from MBTA now (Development only; it also happens automatically) |
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
```

Web app at http://localhost:5173, API at http://localhost:5080, Swagger at http://localhost:5080/swagger.

## Run locally

Requires the .NET 10 SDK, Node 24, and SQL Server on `localhost` (Windows authentication).

```
dotnet run --project NextTrain.Api        # API at http://localhost:5112, database created on startup
cd NextTrain.Web && npm install && npm run dev   # web app at http://localhost:5173
```

Stations import from MBTA automatically when the API starts. The web dev server forwards `/api/*` to the API.

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

New to the code? Start with **[docs/backend.md](docs/backend.md)**: how requests flow, where data comes from, caching, errors, and how to add an endpoint.

- `NextTrain.Core`: domain entities, service interfaces, MBTA DTOs
- `NextTrain.Api`: controllers, EF Core DbContext and migrations, MBTA client, station import and lookup
- `NextTrain.Tests`: xUnit unit, integration, and HTTP endpoint tests
- `NextTrain.Web`: React web app (Vite, Tailwind, React Router); served by nginx in Docker, which proxies `/api` to the API

## Design notes

How the API works (station import, caching, errors, adding an endpoint) is in [docs/backend.md](docs/backend.md). Beyond that:

- Ridership is average weekday boardings per station from MassDOT's Fall 2024 counts (embedded snapshot, applied on import). Mattapan stops are not in the dataset.
- `/alerts` returns every subway alert with the routes, stations, and directions it covers; the app decides what each line, station, and commute shows. A line's status counts alerts of severity 3 and up (MBTA uses 1-2 for things like a closed staircase, which still show on that station's page).
- The live map (`/map`) is Apple Maps (MapKit JS), loaded only when the map opens. `mapkit.ts` pins Apple's script to one version with a Subresource Integrity hash, and MapKit gets its 30-minute tokens from `GET /mapkit/token`, so the signing key stays on the server. Trains are drawn on their own line, pointing the way they're going (`snap.ts`).

## Hosting (Azure)

Merging to `main` deploys automatically once CI passes (`.github/workflows/deploy.yml`):

| Piece | Azure service | Cost |
|---|---|---|
| Web app | Static Web Apps (Free) | $0 |
| API | Container Apps (Consumption, 0.25 vCPU, 1 replica from 4:30 AM to 2 AM Eastern, at most 1) running the root `Dockerfile`, image on ghcr.io | ~$4–5/month |
| Database | Azure SQL Database, Basic (5 DTU, 2 GB) | ~$5/month |

A $10/month budget on the resource group emails the subscription owner at 50%, 80%, and 100% of actual spend and at 100% forecast. Azure has no hard cap on pay-as-you-go spending, so the limits above (one replica, fixed-price database) are what keep the bill small.

Production settings live in Azure, never in the repo: the connection string, MBTA key, and MapKit private key are Container App secrets, and `Cors__AllowedOrigins__2` adds the web app's address to the allowed origins. GitHub signs in to Azure with OIDC (no stored password) using the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` repository variables; `API_URL` is the address the web app calls, and the `SWA_DEPLOY_TOKEN` secret uploads the web app. The optional `GA_MEASUREMENT_ID` repository variable (e.g. `G-ABC123`) turns on consent-gated Google Analytics for the website build; the iPhone app never has analytics.

Scaling (set in Azure, not by the deploy): a `cron` rule keeps one API instance running from 4:30 AM to 2:00 AM Eastern (`America/New_York`, so daylight saving is handled), when people ride the T. Overnight it may scale to zero; the `http` rule wakes it for a visitor, which can take from seconds to minutes when Azure is short on capacity. Waking from zero during the day is what caused slow first loads before the schedule.

Protection: the API limits each client IP to `RateLimit:PerMinute` requests (600 by default; the app uses about 20), answering 429 with `Retry-After` beyond that, so one runaway client can't run up the bill or use up the MBTA key. The website sends security headers from `NextTrain.Web/public/staticwebapp.config.json`: a Content-Security-Policy, no framing by other sites, and location allowed only for NextTrain itself. **If the API address (`API_URL`) or a third-party service changes, update the policy's `connect-src`/`script-src`**, or the site can't reach it.

## Road to the App Store

The iPhone app wraps the web app with [Capacitor](https://capacitorjs.com); its Xcode project is `NextTrain.Web/ios` (bundle ID `com.longledev.nexttrain`). **[docs/app-store](docs/app-store/README.md)** has everything for the listing (screenshots, text, App Privacy answers, review notes) and the submission checklist.

**No Mac needed:** the **TestFlight** workflow (`.github/workflows/testflight.yml`, run by hand from the Actions tab) builds the app on a GitHub Mac and uploads it to TestFlight, signed automatically with an App Store Connect API key stored as the `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY` secrets. On a Mac instead:

```
cd NextTrain.Web && VITE_API_URL=https://api.nexttrain.longledev.com npm run ios && npx cap open ios
```

Ideas for later: Sign in with Apple (commutes across devices), and push notifications for commutes ("your train leaves in 5 min"), which would also give the app native value beyond the website (App Review guideline 4.2).
