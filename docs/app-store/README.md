# App Store listing kit

Everything App Store Connect asks for, drafted from what the app does today. Edit freely; the fields marked *you decide* are yours to fill in.

## Screenshots

For **version 1.3**: captured in dark mode from the iPhone app as built for TestFlight build 9 (native mode), with live MBTA data on Monday evening, October 12, 2026, at both sizes App Store Connect asks for:

- `screenshots/`: 1290 × 2796, the **6.9" iPhone** slot
- `screenshots/6.5-inch/`: 1284 × 2778, the **6.5" iPhone** slot
- `screenshots/6.3-inch/`: 1206 × 2622, the **6.1" / 6.3" iPhone** slot (taken October 13, 2026). Use this set if App Store Connect asks for 6.1" or 6.3" screenshots: it refuses the other sizes there

| File | Shows |
|---|---|
| `1-home.png` | Home: a commute that changes from the Green Line to the Blue Line, with its next train and live transfer advice ("Hurry: this one makes the 11:29 PM Blue Line train"), and live departures at the nearest station |
| `2-map.png` | The live map on Apple Maps: every line, station, and train, with the Subway | Bus switch |
| `3-map-train.png` | Zoomed in with station names and direction arrows, and a train's card: destination, next stop, and how crowded each car is |
| `4-map-bus.png` | Bus mode: route 66's streets, stops, and buses, its Inbound/Outbound ends, and a stop's card with its next buses, **Add commute**, and **All departures** |
| `5-map-inbound.png` | Inbound only: every train heading toward downtown |
| `6-station.png` | Harvard: an escalator outage, then its trains and its buses, each under its own heading |
| `7-line-live-trains.png` | The Red Line diagram with live trains and direction arrows |
| `8-lines.png` | Every subway line's service status (the bus routes follow below) |

To retake them, run the app locally (API on 5112, Vite on 5173) and capture at 430 × 932, 428 × 926, and 402 × 874 CSS pixels at 3×, dark color scheme, while trains are running, with a commute saved that's on at the time (pick every day, since new commutes default to weekdays; a commute's window can't cross midnight). Map shots need the MapKit key in user-secrets.

Make the app **iPhone-only** in Xcode (Supported Destinations: iPhone). Otherwise Apple also requires iPad screenshots and reviews the iPad layout.

## Artwork

For App Store Connect's artwork (the header and search-result slots take **5244 × 2950** or **3840 × 1646**). Drawn from the app icon (its train, background, and the line colors) with no words, since Apple writes its own text over the bottom:

| File | Size | Shape |
|---|---|---|
| `artwork/artwork-5244x2950.png` | 5244 × 2950 | 16:9 |
| `artwork/artwork-3840x1646.png` | 3840 × 1646 | 21:9, wider |

Upload whichever size the slot asks for. To change them, edit and run `node docs/app-store/artwork/render.mjs` (needs Playwright and Edge, as for the screenshots).

## Listing text

Updated for **version 1.3**; 1.0 was approved with the subway-only wording. The name and subtitle can change with any new version.

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
boston,subway,bus,train,transit,commute,delay,alerts,widget,red line,orange line,green line,metro
```

**Promotional text** (170 max, can be changed any time without a new build):

```
Know when your train or bus leaves, and whether to hurry for your transfer. Live times, delay alerts, and your commute on your Home Screen, for all of Boston's T.
```

**Description** (4,000 max):

```
NextTrain shows live times for Boston's subway and buses, built for the trip you take every day.

YOUR COMMUTE, AT A GLANCE
Save the trips you take: your station, line, direction, and the time you usually leave. When it's time to go, the next train is waiting on the home screen, with any delay or suspension that affects it.

MAKE YOUR TRANSFER
Change lines on the way? Add the station where you change and NextTrain tells you, live, whether to hurry for this train or relax because the next one makes the same connection.

DELAY ALERTS
Turn on delay alerts and NextTrain notifies you when a suspension, closure, or long delay hits one of your commutes, from 30 minutes before you leave.

YOUR COMMUTE ON YOUR HOME SCREEN
Add the NextTrain widget to your Home Screen or Lock Screen to see your next train without opening the app, and follow it in Live Activities.

LIVE DEPARTURES
Every station and bus stop shows its next trains and buses for each route and direction, counting down in real time and refreshing every 10 seconds. Late at night and early in the morning, when nothing is predicted yet, you see the timetable times instead.

BUSES TOO
All 150 MBTA bus routes, Silver Line included. Find a route by its number ("66", "SL1"), see its stops in order and its buses moving along them, and save a bus commute. Each side of the street is its own stop, and NextTrain tells you which way each one goes.

NEAR YOU
See the closest stations and bus stops, how far a walk they are, and the next trains and buses at the nearest ones. Your location never leaves your phone.

SERVICE ALERTS
Delays, shuttle buses, suspensions, and station closures appear on the lines, stations, and commutes they affect. Planned changes for the next two weeks show on each line, and each station lists its elevator and escalator outages.

LIVE LINE DIAGRAMS AND MAP
Watch every train move along its line, or across the whole system on the map, with arrows showing which way each one is heading. Zoom in to see station names, filter to a single line or Green Line branch, show only inbound or outbound trains, or switch to buses to see a route's streets, stops, and buses.

HOW FULL IS IT?
Tap a train or bus on the map to see where it's headed and, where the MBTA reports it, how crowded it is (for trains, car by car).

SEARCH THAT GETS YOU
"harvard sq", "park st", "gov ctr": type it the way you say it.

PRIVATE BY DESIGN
No account, no ads, no tracking. Your commutes are saved under a random ID, delay alerts are off until you turn them on, and Settings → Delete my data erases everything.

Live data comes from the MBTA. NextTrain is an independent app and isn't affiliated with or endorsed by the MBTA.
```

**What's New in Version 1.3** (4,000 max). Riders are updating from 1.0, so this covers 1.2's buses too:

```
Buses are here, plus a lot more for your daily commute.

- Buses: all 150 MBTA routes, Silver Line included. Search by number ("66", "SL1"), see stops near you, and save a bus commute.
- Trip planner: search any address on Home and get the best train or bus there, with at most one change, and whether to hurry or relax.
- Transfer advice: add where you change, even to a bus a short walk away, and NextTrain tells you whether to hurry for this train or take the next one.
- Bus stops show a nearby landmark, like "(near Taco Bell)", so you know which side of the street to stand on, plus Apple's street view of the stop.
- Delay alerts: get notified when a suspension, closure, or long delay hits one of your commutes.
- Widget: your next train on your Home Screen and Lock Screen.
- Live Activity: your commute counts down on the Lock Screen and in the Dynamic Island, moving on to the next train by itself.
- Map: switch between Subway and Bus, show only inbound or outbound trains, and tap any stop to save it as a commute.
- Scheduled times late at night and early in the morning, when nothing is predicted yet.
- Planned changes for the next two weeks on each line, and elevator and escalator outages at each station.
- One search for stations, buses, and addresses; location asked only once; a calmer map; and many smaller fixes.
```

What's New only shows for updates, so it's asked for from 1.3 on (1.0 is the first release).

## App Privacy answers

What the app does today (see `/privacy`). You submit the final answers in App Store Connect; these are the conservative reading.

| Data type | Collected? | Purpose | Linked to user | Tracking |
|---|---|---|---|---|
| Identifiers → User ID (the random ID created on the device) | Yes | App Functionality | Yes, it's what ties commutes to the device | No |
| User Content → Other User Content (saved commutes) | Yes | App Functionality | Yes | No |
| Location | **No**: only used on the device, never sent | – | – | – |
| Identifiers → Device ID (the push token, only with delay alerts on), from **1.3** | Yes | App Functionality | Yes | No |
| Diagnostics → Crash Data (error reports: what went wrong, the page path, app version), from **1.3** | Yes | App Functionality | **No** | No |
| Everything else (contact info, usage data, …) | No: no analytics or ads | – | – | – |

The app's privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) declares the same types (Device ID and Crash Data from 1.3), no tracking, and the one "required reason" API it uses (UserDefaults, reason `CA92.1`, via Capacitor's storage). Keep it and these answers in step; Apple checks the manifest at upload.

The website's optional Google Analytics (after consent) is off in the app, both by build (the iPhone build has no `VITE_GA_ID`) and in code (`analytics.ts` refuses to run inside Capacitor), so these answers don't change. Version 1.3 adds error reports (`src/errors.ts`): answer **Crash Data** when you submit 1.3. If you add analytics to the app later, update these answers and the privacy policy.

## Review notes

App Review asked new developer accounts for this under Guideline 2.1 (October 2026). Paste it into **App Review Information → Notes** for every submission, and attach a fresh screen recording when asked (see "Screen recording" below).

```
1. PURPOSE AND AUDIENCE
NextTrain is a free app for people who ride Boston's subway (the MBTA Red, Orange, Blue, Green, and Mattapan lines) and, from version 1.2, its buses (all 150 routes, Silver Line included). It answers "when is my next train?" quickly: live departures for every subway station, service alerts, a live map and line diagrams showing where each train is, and saved daily commutes that show your next train on the Home screen when it's time to go, with advice on making a transfer, optional delay notifications, and a Home Screen widget. No account, no ads, no in-app purchases.

2. SETUP AND HOW TO USE IT
No login or account is needed, and there is nothing to set up.
- On first launch, a one-time Welcome screen explains that times are estimates from MBTA data and asks the user to agree to the Terms of Use and Privacy Policy (both linked there). Tap "Agree and continue".
- Location permission is optional and only used on the device to find nearby stations. Outside Boston, "Near you" says you're outside the service area; use Search (e.g. "Park Street") or the Lines and Map tabs instead.
- Station pages: live departures by line and direction, alerts, and directions.
- Lines tab: each line's status; open a line to see its trains move along the diagram.
- Map tab: every train live on Apple Maps; tap a train for its destination and, where the MBTA reports it, how crowded each car is.
- Commutes: Home -> Add a commute. Saved commutes are private to the device (stored under a random ID, not shared with anyone).
- Trip planner: type an address or place in Home's search and pick it under "Places". The address is looked up by Apple (MapKit); our server only receives the IDs of nearby stops and walking minutes, with no user ID, and stores nothing.
- Bus stop pages show Apple's Look Around street view of the stop, and each bus stop names a nearby landmark (from OpenStreetMap, credited in Settings).
- Data deletion: Settings -> Delete my data removes saved commutes from our server and clears local data. Help & support is in Settings.
- Live Activities (version 1.1 and later): Settings -> Preview Live Activity, then lock the phone.
- Buses (version 1.2 and later): search a route number such as "66" or "SL1", or open Lines -> Buses. On the Map, the Bus switch shows one route's streets, stops, and live buses. Tap a bus stop for its next buses.
- Map direction (1.3): under the line picker, Inbound or Outbound shows only the trains or buses going that way (toward or away from downtown Boston).
- Transfers (1.3): Home -> Add a commute -> Park Street, Green Line, toward Medford/Tufts -> Add a transfer -> Government Center, Blue Line, toward Wonderland -> Save. While the commute is on, its card says whether to hurry for this train or take the next one.
- Delay alerts (1.3): with a commute saved, Home asks "Get delay alerts?" once (or Settings -> Notifications -> Delay alerts). A notification arrives only when the MBTA reports a suspension, closure, or long delay on that commute's line and station, from 30 minutes before it starts, so one may not arrive during review.
- Widget (1.3): long-press the Home Screen -> + -> NextTrain. It shows the next trains for the commute that's on or next.
There is no user-generated content visible to others and no paid content.

3. EXTERNAL SERVICES
- MBTA V3 API (Massachusetts Bay Transportation Authority): real-time predictions, vehicle positions, alerts, and station data, used under the MassDOT Developer License Agreement.
- Apple MapKit JS: the map. Our server issues short-lived MapKit tokens.
- Apple Push Notification service: delay alerts, sent only to riders who turn them on.
- Microsoft Azure: our API (Azure Container Apps), database for saved commutes (Azure SQL), and website (Azure Static Web Apps).
- Cloudflare: DNS and email forwarding for longledev.com, and protection of the website and API from attacks and automated abuse.
The app uses no third-party sign-in, payment, advertising, analytics, or AI services.

4. REGIONAL DIFFERENCES
The app works the same in every region. Its content is about Boston's subway by nature; outside the Boston area, "Near you" shows that you're outside the service area, and everything else works normally.

5. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
NextTrain is not in a regulated industry. Transit data is public MBTA data used under the MassDOT Developer License Agreement (https://cdn.mbta.com/sites/default/files/2023-08/mbta-massdot-develop-license-agreement.pdf), which permits apps like this one with attribution. The app credits MassDOT as the data provider (Settings), states that it is independent and not affiliated with or endorsed by the MBTA or MassDOT, and does not use MBTA logos. Maps are provided by Apple under the MapKit terms.
```

### Screen recording

Record on a real iPhone running the latest iOS, with the build that's in review (TestFlight), starting from the Home Screen. About 3 minutes:

1. Tap the NextTrain icon (the recording must show the launch).
2. Welcome screen → **Agree and continue**.
3. Allow location → Home, "Near you" with live departures.
4. Search "Park Street" → the station's live departures and alerts.
5. **Lines** → Red Line → trains moving on the diagram.
6. **Map** → zoom in (station names) → tap a train (destination, crowding) → a Green Line branch.
7. Home → **Add a commute** (e.g. Park Street, Red Line, toward Alewife, weekdays) → Save → the commute card with its next train.
8. Edit that commute → **Add a transfer** (Government Center, Blue Line, toward Wonderland) → Save → the transfer advice on its card.
9. **Get delay alerts?** → **Turn on** → Allow.
10. **Map** → **Inbound**.
11. Home Screen: long-press → **+** → NextTrain → add the widget.
12. Settings → Help & support → back → **Delete my data** → confirm.

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

## Releasing 1.0, then submitting 1.3

**1.0 is approved.** Its status, **Pending Developer Release**, means Apple approved it and is waiting for you, because it was set to release manually. Click **Release This Version** and it's on the App Store within about 24 hours, subway-only, as approved.

**Then 1.3 is the first update.** It includes everything from 1.2 (buses), so 1.2 is skipped. Before you submit:
1. **Turn on delay alerts on the server:** set the APNs key in Azure (the commands are in PR #83, "Your steps"). Without it, a reviewer can turn alerts on and never get one.
2. **Try the latest TestFlight build on your phone:** a transfer commute, the map's Inbound/Outbound switch, delay alerts on, and the widget.

**Steps:**
1. App Store Connect → **Apps → NextTrain → +** (next to iOS App) → **1.3**.
2. **Build:** choose the newest **1.3** build (build 9 or later).
3. **Text:** paste the promotional text, description, keywords, and **What's New in Version 1.3** from *Listing text* above.
4. **Screenshots:** in **iPhone 6.9" Display**, remove the old ones and drag in the 8 files from `screenshots/` in order. Do the same for **6.5" Display** with `screenshots/6.5-inch/`, and for **6.1" / 6.3" Display** with `screenshots/6.3-inch/` (1206 × 2622).
5. **App Privacy** (Apps → NextTrain → App Privacy → Edit): add **Identifiers → Device ID** and **Diagnostics → Crash Data**, as in *App Privacy answers* above, then **Publish**.
6. **App Review Information:** paste the review notes above, which cover 1.3. Then **Add for Review → Submit**. Choose **Manually release** if you want to pick the moment it goes live.

An update's review usually takes 1 to 3 days.

## Protecting yourself

Built into the app (see `docs/legal.md`):

- **Agreement on first launch.** Before first use, and again whenever the Terms change, the app shows what it is, that times are MBTA estimates, that it isn't affiliated with the MBTA, and an **Agree and continue** button for the Terms of Use and Privacy Policy.
- **A real Support page** at `/support` (the Support URL above): a contact email, where to go for MBTA service problems, "call 911" for emergencies, and answers to common questions.
- **Trademarks:** the name, icon, and screenshots don't use the MBTA's "T" logo, and "MBTA" stays out of the name and keywords. The description uses "MBTA" only to say where the data comes from, and says the app isn't affiliated. Keep it that way.
- **Screenshots** show only the app and public MBTA data: no personal information, no other apps' logos.

Also consider, outside the code: have a lawyer review the Terms and Privacy Policy, and, once there's revenue, an LLC so a claim can't reach personal assets.

**Guideline 4.2 risk:** Apple rejects apps that are "just a website". NextTrain's native-feeling UI, location, offline handling, and live features help. Adding **push notifications for commutes** ("your train leaves in 5 minutes") is the strongest answer if Review pushes back. Sign in with Apple is **not** required, because the app offers no third-party login.
