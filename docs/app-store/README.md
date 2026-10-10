# App Store listing kit

Everything App Store Connect asks for, drafted from what the app does today. Edit freely; the fields marked *you decide* are yours to fill in.

## Screenshots

For **version 1.2**: captured in dark mode from the iPhone app as built for TestFlight build 6 (native mode), with live MBTA data on Saturday, October 10, 2026, at both sizes App Store Connect asks for:

- `screenshots/`: 1290 × 2796, the **6.9" iPhone** slot
- `screenshots/6.5-inch/`: 1284 × 2778, the **6.5" iPhone** slot

| File | Shows |
|---|---|
| `1-home.png` | Home: a commute happening now with its next train, and live departures at the nearest station |
| `2-map.png` | The live map on Apple Maps: every line, station, and train |
| `3-map-train.png` | Zoomed in with station names and direction arrows, and a train's card: destination, next stop, and how crowded each car is |
| `4-map-bus.png` | Bus mode: route 66's streets, stops, and buses, and a stop's card with its next buses, **Add commute**, and **All departures** |
| `5-station.png` | Harvard: its trains and its buses, each under its own heading |
| `6-line-live-trains.png` | The Red Line diagram with live trains and direction arrows |
| `7-lines.png` | Every subway line's service status (the bus routes follow below) |

To retake them, run the app locally (API on 5112, Vite on 5173) and capture at 430 × 932 and 428 × 926 CSS pixels at 3×, dark color scheme, with a commute saved that's on at the time (pick every day, since new commutes default to weekdays). Map shots need the MapKit key in user-secrets.

Make the app **iPhone-only** in Xcode (Supported Destinations: iPhone). Otherwise Apple also requires iPad screenshots and reviews the iPad layout.

## Listing text

Updated for **version 1.2 (buses)**; 1.0 went out with the subway-only wording. The name and subtitle can change with any new version.

| Field | Draft |
|---|---|
| Name (30 max) | NextTrain – Boston T & Bus |
| Subtitle (30 max) | Live subway & bus times |
| Category | Navigation (secondary: Travel) |
| Age rating | 4+ |
| Price | *you decide* (free fits the scope) |
| Support URL | https://nexttrain.longledev.com/support |
| Privacy Policy URL | https://nexttrain.longledev.com/privacy |
| Copyright | 2026 longledev |

**Keywords** (100 max, comma-separated, no spaces needed). Keep "MBTA" out: App Review flags other companies' trademarks used as keywords (guideline 2.3.7).

```
boston,subway,bus,train,transit,commute,red line,orange line,green line,blue line,silver line,metro
```

**Promotional text** (170 max, can be changed any time without a new build):

```
Know when your train or bus leaves. Live departures, alerts, and your daily commute at a glance, for every subway station and bus stop in Boston.
```

**Description** (4,000 max):

```
NextTrain shows live times for Boston's subway and buses, built for the trip you take every day.

YOUR COMMUTE, AT A GLANCE
Save the trips you take: your station, line, direction, and the time you usually leave. When it's time to go, the next train is waiting on the home screen, with any delay or suspension that affects it.

LIVE DEPARTURES
Every station and bus stop shows its next trains and buses for each route and direction, counting down in real time and refreshing every 10 seconds.

BUSES TOO
All 150 MBTA bus routes, Silver Line included. Find a route by its number ("66", "SL1"), see its stops in order and its buses moving along them, and save a bus commute. Each side of the street is its own stop, and NextTrain tells you which way each one goes.

NEAR YOU
See the closest stations and bus stops, how far a walk they are, and the next trains and buses at the nearest ones. Your location never leaves your phone.

SERVICE ALERTS
Delays, shuttle buses, suspensions, and station closures appear on the lines, stations, and commutes they affect.

LIVE LINE DIAGRAMS AND MAP
Watch every train move along its line, or across the whole system on the map, with arrows showing which way each one is heading. Zoom in to see station names, filter to a single line or Green Line branch, or pick a bus route to see its streets, stops, and buses.

HOW FULL IS IT?
Tap a train or bus on the map to see where it's headed and, where the MBTA reports it, how crowded it is (for trains, car by car).

SEARCH THAT GETS YOU
"harvard sq", "park st", "gov ctr": type it the way you say it.

PRIVATE BY DESIGN
No account, no ads, no tracking. Your commutes are saved under a random ID, and Settings → Delete my data erases everything.

Live data comes from the MBTA. NextTrain is an independent app and isn't affiliated with or endorsed by the MBTA.
```

**What's New in Version 1.2** (4,000 max):

```
Buses are here. All 150 MBTA bus routes, Silver Line included:
- Search for a route by number ("66", "SL1") or a stop by street
- Bus stops near you, with the next buses at the closest one
- Every route's stops in order, with its buses moving along them
- On the map, tap Bus to see every route, then tap any stop for its next buses, or to save it as your commute
- Save a bus commute, with Live Activities on your Lock Screen

Also new:
- A calmer map: trains are simple dots until you zoom in, and the map appears all at once
- Your location stays visible when you pick a line on the map
- Getting started is easier: a short welcome, a Get started card, and a step-by-step commute form
```

What's New only shows for updates. If 1.2 ends up being the first version released (see below), App Store Connect doesn't ask for it.

## App Privacy answers

What the app does today (see `/privacy`). You submit the final answers in App Store Connect; these are the conservative reading.

| Data type | Collected? | Purpose | Linked to user | Tracking |
|---|---|---|---|---|
| Identifiers → User ID (the random ID created on the device) | Yes | App Functionality | Yes, it's what ties commutes to the device | No |
| User Content → Other User Content (saved commutes) | Yes | App Functionality | Yes | No |
| Location | **No**: only used on the device, never sent | – | – | – |
| Everything else (contact info, usage data, diagnostics, …) | No: no analytics, ads, or crash reporting | – | – | – |

The app's privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) declares the same two types, no tracking, and the one "required reason" API it uses (UserDefaults, reason `CA92.1`, via Capacitor's storage). Keep it and these answers in step; Apple checks the manifest at upload.

Recently viewed stations stay on the device and aren't "collected". The website's optional Google Analytics (after consent) is off in the app, both by build (the iPhone build has no `VITE_GA_ID`) and in code (`analytics.ts` refuses to run inside Capacitor), so these answers don't change. If you add crash reporting or analytics to the app later, update these answers and the privacy policy.

## Review notes

App Review asked new developer accounts for this under Guideline 2.1 (October 2026). Paste it into **App Review Information → Notes** for every submission, and attach a fresh screen recording when asked (see "Screen recording" below).

```
1. PURPOSE AND AUDIENCE
NextTrain is a free app for people who ride Boston's subway (the MBTA Red, Orange, Blue, Green, and Mattapan lines) and, from version 1.2, its buses (all 150 routes, Silver Line included). It answers "when is my next train?" quickly: live departures for every subway station, service alerts, a live map and line diagrams showing where each train is, and saved daily commutes that show your next train on the Home screen when it's time to go. No account, no ads, no in-app purchases.

2. SETUP AND HOW TO USE IT
No login or account is needed, and there is nothing to set up.
- On first launch, a one-time Welcome screen explains that times are estimates from MBTA data and asks the user to agree to the Terms of Use and Privacy Policy (both linked there). Tap "Agree and continue".
- Location permission is optional and only used on the device to find nearby stations. Outside Boston, "Near you" says you're outside the service area; use Search (e.g. "Park Street") or the Lines and Map tabs instead.
- Station pages: live departures by line and direction, alerts, and directions.
- Lines tab: each line's status; open a line to see its trains move along the diagram.
- Map tab: every train live on Apple Maps; tap a train for its destination and, where the MBTA reports it, how crowded each car is.
- Commutes: Home -> Add a commute. Saved commutes are private to the device (stored under a random ID, not shared with anyone).
- Data deletion: Settings -> Delete my data removes saved commutes from our server and clears local data. Help & support is in Settings.
- Live Activities (version 1.1 and later): Settings -> Preview Live Activity, then lock the phone.
- Buses (version 1.2 and later): search a route number such as "66" or "SL1", or open Lines -> Buses. On the Map, the Bus chip shows one route's streets, stops, and live buses. Tap a bus stop for its next buses.
There is no user-generated content visible to others and no paid content.

3. EXTERNAL SERVICES
- MBTA V3 API (Massachusetts Bay Transportation Authority): real-time predictions, vehicle positions, alerts, and station data, used under the MassDOT Developer License Agreement.
- Apple MapKit JS: the map. Our server issues short-lived MapKit tokens.
- Microsoft Azure: our API (Azure Container Apps), database for saved commutes (Azure SQL), and website (Azure Static Web Apps).
- Cloudflare: DNS and email forwarding for longledev.com, and protection of the website and API from attacks and automated abuse.
The app uses no third-party sign-in, payment, advertising, analytics, or AI services.

4. REGIONAL DIFFERENCES
The app works the same in every region. Its content is about Boston's subway by nature; outside the Boston area, "Near you" shows that you're outside the service area, and everything else works normally.

5. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
NextTrain is not in a regulated industry. Transit data is public MBTA data used under the MassDOT Developer License Agreement (https://cdn.mbta.com/sites/default/files/2023-08/mbta-massdot-develop-license-agreement.pdf), which permits apps like this one with attribution. The app credits MassDOT as the data provider (Settings), states that it is independent and not affiliated with or endorsed by the MBTA or MassDOT, and does not use MBTA logos. Maps are provided by Apple under the MapKit terms.
```

### Screen recording

Record on a real iPhone running the latest iOS, with the build that's in review (TestFlight), starting from the Home Screen. About 2 minutes:

1. Tap the NextTrain icon (the recording must show the launch).
2. Welcome screen → **Agree and continue**.
3. Allow location → Home, "Near you" with live departures.
4. Search "Park Street" → the station's live departures and alerts.
5. **Lines** → Red Line → trains moving on the diagram.
6. **Map** → zoom in (station names) → tap a train (destination, crowding) → a Green Line branch.
7. Home → **Add a commute** (e.g. Park Street, Red Line, toward Alewife, weekdays) → Save → the commute card with its next train.
8. Settings → Help & support → back → **Delete my data** → confirm.

Upload the .mov as an attachment to the reply in App Store Connect.

## Info.plist strings

| Key | Value |
|---|---|
| `NSLocationWhenInUseUsageDescription` | NextTrain uses your location to show the subway stations closest to you. Your location stays on your device. |
| `ITSAppUsesNonExemptEncryption` | `NO` (the app only uses standard HTTPS), so the Export Compliance question is answered for you |

## Before you submit

1. ~~Host the API and web app~~: done, on Azure at https://api.nexttrain.longledev.com and https://nexttrain.longledev.com (see the main README's Hosting section).
2. ~~Switch the map to Apple Maps~~: done (MapKit JS, tokens from `GET /mapkit/token`).
3. **Build the iPhone app.** Without a Mac: Actions → **TestFlight** → Run workflow (needs the three `ASC_*` secrets; see the top of `.github/workflows/testflight.yml`). With a Mac: The Xcode project is already in `NextTrain.Web/ios`: iPhone-only, portrait, app icon, branded launch screen, and the Info.plist strings above. The bundle ID is `com.longledev.nexttrain`; it can't change after the first upload.
   ```
   cd NextTrain.Web
   npm ci
   VITE_API_URL=https://api.nexttrain.longledev.com npm run ios   # build the web app and copy it into the iOS project
   npx cap open ios                                    # opens Xcode: set your signing team, then Run or Archive
   ```
   For the Simulator against your local API, use `VITE_API_URL=http://localhost:5112` instead (the app allows local-network HTTP for this).
4. **Ship to TestFlight first** and try it on the subway, including the offline banner in a tunnel.

## Submitting version 1.2

Version 1.2 is **TestFlight build 6** (uploaded October 10, 2026): buses, the rider-feedback fixes, and the map's bus routes and stop cards. Submit it once your testers are happy. Everything built after build 6 is 1.3.

**While 1.0 is still in review,** App Store Connect won't take a second version. Choose one:

- **Let 1.0 finish (simplest).** When it's approved, follow the steps below for an update.
- **Or replace it with 1.2.** If 1.0 has been waiting more than about a week, open version 1.0 in App Store Connect and choose **Remove from Review**. Until the app's first release, you can then change that version's number to **1.2** and follow steps 2–5 below. You give up 1.0's place in the queue, but riders get buses on day one.

**Steps:**
1. App Store Connect → **Apps → NextTrain → +** (next to iOS App) → **1.2**.
2. **Build:** choose **1.2 (6)**.
3. **Text:** paste the 1.2 name, subtitle, promotional text, description, keywords, and What's New from *Listing text* above. The name and subtitle can change with any version.
4. **Screenshots:** in **iPhone 6.9" Display**, remove the old ones and drag in the 7 files from `screenshots/` in order. Do the same for **6.5" Display** with `screenshots/6.5-inch/`.
5. **App Review Information:** the notes below already cover buses. Then **Add for Review → Submit**. Choose **Manually release** if you want to pick the moment it goes live.

## Protecting yourself

Built into the app (see `docs/legal.md`):

- **Agreement on first launch.** Before first use, and again whenever the Terms change, the app shows what it is, that times are MBTA estimates, that it isn't affiliated with the MBTA, and an **Agree and continue** button for the Terms of Use and Privacy Policy.
- **A real Support page** at `/support` (the Support URL above): a contact email, where to go for MBTA service problems, "call 911" for emergencies, and answers to common questions.
- **Trademarks:** the name, icon, and screenshots don't use the MBTA's "T" logo, and "MBTA" stays out of the name and keywords. The description uses "MBTA" only to say where the data comes from, and says the app isn't affiliated. Keep it that way.
- **Screenshots** show only the app and public MBTA data: no personal information, no other apps' logos.

Also consider, outside the code: have a lawyer review the Terms and Privacy Policy, and, once there's revenue, an LLC so a claim can't reach personal assets.

**Guideline 4.2 risk:** Apple rejects apps that are "just a website". NextTrain's native-feeling UI, location, offline handling, and live features help. Adding **push notifications for commutes** ("your train leaves in 5 minutes") is the strongest answer if Review pushes back. Sign in with Apple is **not** required, because the app offers no third-party login.
