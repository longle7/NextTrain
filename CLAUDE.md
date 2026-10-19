# NextTrain

Live MBTA subway and bus times. ASP.NET Core 10 API (`NextTrain.Api`, with domain types and `IMbtaClient` in `NextTrain.Core`), a React 19 + Vite web app (`NextTrain.Web`), and the same web app wrapped as an iPhone app by Capacitor 8 (`NextTrain.Web/ios`). Commuter rail and ferry are out of scope.

More detail: `README.md` (running, hosting, TestFlight), `docs/backend.md` (request flows, adding an endpoint), `docs/legal.md`, `docs/app-store/README.md`. README's endpoint table and backend.md's cache numbers are partly stale: trust the code.

## Commands

- API: `dotnet run --project NextTrain.Api` (http://localhost:5112). MBTA key: `dotnet user-secrets set "Mbta:ApiKey" <key> --project NextTrain.Api` (without one MBTA allows 20 calls/min).
- API tests: `dotnet test NextTrain.slnx`. Needs a real SQL Server: localhost, Windows auth, DB `NextTrainDb_Tests`, or set `NEXTTRAIN_TEST_DB`. Tests run one at a time. Stop a running API first, or the build fails on locked DLLs. One class: `dotnet test --filter "FullyQualifiedName~BusEndpointTests"`.
- Web (in `NextTrain.Web`): `npm run dev` (:5173, proxies `/api` to :5112), `npm test` (Vitest), `npm run lint` (oxlint), `npm run build` (`tsc -b` + Vite). One file: `npx vitest run src/time.test.ts -t "name"`.
- Script tests: `node --test ".github/scripts/*.test.mjs"` (in CI), `node --test tools/landmarks/` (not in CI).
- iOS: `npm run ios` (build + `cap sync ios`). There is no Mac: iOS builds only on GitHub's `macos-26` runners.
- Before a PR, run what `.github/workflows/ci.yml` runs: `dotnet test NextTrain.slnx`, then `npm run lint && npm test && npm run build` in `NextTrain.Web`, then the script tests. CI's `ios-build` job checks the Xcode build.

## API rules

- **Never change what an existing endpoint answers by default.** App versions already in the App Store call the production API. New behaviour is opt-in through new query params or new paths: `/routes` is subway-only, `?type=bus|all` adds buses; `/stations` without a route is subway-only, bus stops live at `/bus-stops`; `Station.RouteId` stays subway-only and buses go in `BusRoutes` (`"route:direction"`). `BusEndpointTests` locks in what the 1.0 app gets.
- New response fields are optional and carry `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]` (or `WhenWritingDefault`), so older apps get the same JSON as before.
- MBTA calls go in `IMbtaClient` + `MbtaClient` through `GetCachedAsync` (it caches the Task, so concurrent callers share one call; cache times are at the top of `MbtaClient.cs`). Every new method also goes in `NextTrain.Tests/FakeMbtaClient.cs`, or the tests don't compile. New JSON parsing gets a case in `MbtaClientTests`.
- Don't try/catch MBTA failures in controllers: `MbtaUnavailableFilter` turns them into a 503. Errors are problem JSON.
- Objects returned by `MbtaClient` are shared cache entries. Never mutate them; copy instead.
- Check every route/stop ID parameter with `StationRoutes.RouteIdPattern` / `StopIdPattern` before it goes into an MBTA URL.
- No auth: users are an anonymous `X-User-Id` header (`[FromHeader, Required, MaxLength(100)]`). Endpoints that store user data live under `/commutes` or `/me`, and `DELETE /me` must remove everything a new table stores.
- Migrations: `dotnet ef migrations add <Name> --project NextTrain.Api`. Never hand-edit them; they run at startup.
- The API runs as one replica on purpose (startup migrations, `DelayNotifier`, `LiveActivityUpdater`). Don't add anything that needs two.
- Privacy: production logs stay at Warning. Never log IPs, request bodies or user IDs; the Privacy Policy promises it.

## MBTA API quirks (each one caused a past bug)

- Bus route IDs aren't what riders see (SL1 is `741`, CT3 is `708`): show `shortName`. Each side of a street is its own stop, and some bus routes end inside subway stations.
- `/stops` includes route relationships only when filtered by a single route, so the import goes route by route.
- MBTA rejects `filter[typicality]`; typical shapes are picked in code. The fakes didn't catch that, so try new filters against the real API.
- Departed trains stay listed for a few minutes: keep only departures at or after now (`TimeProvider`).
- Predictions cover only the next one or two trips; `?schedules=true` fills the gap with the timetable.
- Subway directions are only N/S or E/W; "inbound" means toward downtown.
- The station import must never mass-delete: it changes nothing on an empty or under-half answer, and keeps stops a commute uses.
- In scope: route types 0/1 (subway; Mattapan counts with Red) and 3 (bus, Silver Line included).

## Web rules (`NextTrain.Web/src`)

- Fetch data with `usePolling(fetcher, key, interval, { remember })`, never your own `fetch` + `setInterval`. The key is the API path. Use `remember: false` for big answers (`/bus-stops`) and forms.
- HTTP goes through `api.ts`: `api<T>()` (15 s timeout, `ApiError` with a message to show) or `request()`. A GET that doesn't need the user sends no extra headers, so it skips the CORS preflight (see `getTrips`, `getMapKitToken`).
- Storage goes through `readKey` / `writeKey` / `remember` in `cache.ts`, never `localStorage` directly. A new `nexttrain.*` key, or any new data the app keeps, also needs: a line in `pages/CookiesPage.tsx`, clearing in `deleteMyData` (`pages/SettingsPage.tsx`), the Privacy page updated, and `EFFECTIVE_DATE` in `legal.ts` bumped. Bumping it makes every user accept the terms again, so only do it for a real policy change.
- Reuse what's there before writing helpers: `api.ts` (`lineLabel`, `routeName`, `isSubwayRoute`, `busRouteIds`, `searchStations`…), `time.ts` (`countdown`, `departureLabel`, Boston service-day logic), `components.tsx` (button classes, `Card`, `LineBadge`, `Status`, `AlertBanner`…).
- Native-only code checks `Capacitor.isNativePlatform()` and quietly does nothing on the website (see `liveActivity.ts`, `notifications.ts`). Location on iOS goes through `@capacitor/geolocation` (`geo.ts`).
- Routing imports from `react-router` (v8), not `react-router-dom`.
- The map is Apple MapKit JS (`mapkit.ts`), version pinned with an SRI hash: recompute it when upgrading. Build markers with DOM calls, never HTML strings.
- A new third-party domain or API host must be added to the CSP in `public/staticwebapp.config.json`, or the website breaks.
- Analytics (`VITE_GA_ID`) is website-only and consent-gated; it never runs in the iOS app.
- Styling is inline Tailwind v4 (theme colours in `index.css`), dark mode via `dark:`. Keep tap targets ≥ 44 px (`min-h-11`), `sr-only` labels, `role="status"` on loading, `motion-safe:`, `text-base` inputs (stops iOS zoom), safe-area insets.

## iOS (`NextTrain.Web/ios/App`)

- Targets: `App` (`com.longledev.nexttrain`, iOS 15) and the `LiveActivity` extension (Live Activity + `NextCommuteWidget`, iOS 16.2). `CommuteActivityAttributes.swift` and `SharedCommutes.swift` compile into both.
- The iOS build needs `VITE_API_URL` set to the hosted API, otherwise it calls `/api`, which doesn't exist in the app. `ios/App/App/public` is generated.
- `LiveActivityPlugin.swift` is registered by hand in `MainViewController.swift`; a new in-app plugin goes there too. Don't edit `CapApp-SPM/` (Capacitor CLI owns it).
- `CommuteActivityAttributes.ContentState` must decode what `ApnsSender` sends (`LiveActivityContent`). Add new fields as optionals so older builds still decode.
- The widget reads commutes through the keychain group `3CXXU244US.com.longledev.nexttrain.shared` (in both `.entitlements` files and `SharedCommutes.swift`), not an App Group. Change all three together.
- The API pushes only to production APNs: pushes don't arrive in Debug/Xcode builds.
- `PrivacyInfo.xcprivacy`, `src/pages/PrivacyPage.tsx` and the App Privacy answers in `docs/app-store/README.md` must agree.
- App Store version = `MARKETING_VERSION` in `App.xcodeproj/project.pbxproj`, in 4 places; change all 4 together. A new version is needed after each Apple approval. Never edit `CURRENT_PROJECT_VERSION`: CI sets it to the run number. `package.json`'s `version` is separate (the website).
- TestFlight: `gh workflow run testflight.yml --ref main -f notes="<what to test>"` (`-f testers=internal`, `-f build=N` to re-send).

## Tests

- API: each class sets up in its constructor with `TestDb.CreateClean()` and `TestDb.Api(b => b.ConfigureTestServices(...))`, and implements `IDisposable`. Swap in `FakeMbtaClient` (fill its public dictionaries; `FakeMbtaClient.Prediction(...)` builds a prediction; `PredictionsError` simulates MBTA down), `FakeApns`, and `FixedClock` with Boston times like `2026-10-10T12:00:00-04:00`.
- Background services (`DelayNotifierTests`, `LiveActivityUpdaterTests`) build their own `ServiceCollection` instead of the factory.
- Web: Vitest in a `node` environment, so no DOM or component tests. Stub `fetch` with `vi.stubGlobal`, `localStorage` with a Map-backed object, Capacitor with `vi.mock('@capacitor/core')` + `vi.hoisted`. No fake timers: functions take `now` as a parameter. `it.each` tables with real MBTA names.
- There are no end-to-end tests in the repo; check UI changes by running the app.

## Style

- Comments explain *why*, in plain English. A deliberate shortcut gets `// ponytail: <limit>, <upgrade path>`.
- C#: block-scoped namespaces in Api/Core, file-scoped in Tests; `_camelCase` fields; records for responses; tests named `Subject_Behavior`.
- TypeScript: no semicolons, single quotes, no enums (`erasableSyntaxOnly`); `*.test.ts` next to the code, with full-sentence test names.

## Git and PRs

- One branch and one PR to `main` per change; the owner (longle7) reviews and merges. Branch from `origin/main` (local `main` is often behind). Don't stack PRs: merged branches aren't deleted here, so a stacked PR lands in a dead branch.
- No `Co-Authored-By` or "Generated with Claude" lines in commits or PRs.
- Branch names: `feat/`, `fix/`, `perf/`, `chore/`, `docs/`, `ci/`, `refactor/`, `security/` + kebab-case.
- Commit subject: an area and a colon, then a plain-English sentence about the result (`Trips: …`, `Map: …`, `API: …`). No `feat:` prefixes. Body: `-` bullets naming files and why.
- PR body: what the rider or developer gets; a `| Where | Change | Why |` table with `path:line` for every change; for API changes, a line saying why older apps are unaffected; `## Tests` with counts; and anything that can only be checked after merging (Swift compiles only in CI).
- Merging to `main` deploys automatically after CI (`deploy.yml`: Azure Container Apps for the API, Static Web Apps for the website).
