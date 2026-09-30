# App Store listing kit

Everything App Store Connect asks for, drafted from what the app does today. Edit freely; the fields marked *you decide* are yours to fill in.

## Screenshots

In `screenshots/`: 1290 × 2796 PNGs, an accepted size for the required **6.9" iPhone** slot (Apple scales them down for smaller iPhones). Captured from the real app with live MBTA data on September 29, 2026.

| File | Shows |
|---|---|
| `1-home.png` | Home: a commute happening now with its next train and an alert, and live departures at the nearest station |
| `2-station.png` | A station's live departures by line and direction |
| `3-lines.png` | Every line's service status |
| `4-line-live-trains.png` | The Red Line diagram with live trains and direction arrows |
| `5-map.png` | The live map of lines, stations, and trains |

Make the app **iPhone-only** in Xcode (Supported Destinations: iPhone). Otherwise Apple also requires iPad screenshots and reviews the iPad layout.

## Listing text

| Field | Draft |
|---|---|
| Name (30 max) | NextTrain – Boston Subway |
| Subtitle (30 max) | Live subway times and alerts |
| Category | Navigation (secondary: Travel) |
| Age rating | 4+ |
| Price | *you decide* (free fits the scope) |
| Support URL | https://github.com/longle7/NextTrain/issues |
| Privacy Policy URL | https://nexttrain.longledev.com/privacy |
| Copyright | *you decide*, e.g. "2026 Your Name" |

**Keywords** (100 max, comma-separated, no spaces needed). Keep "MBTA" out: App Review flags other companies' trademarks used as keywords (guideline 2.3.7).

```
boston,subway,train,transit,commute,red line,orange line,green line,blue line,arrivals,metro
```

**Promotional text** (170 max, can be changed any time without a new build):

```
Know when your train leaves. Live departures, service alerts, and your daily commute at a glance, for every station on the Red, Orange, Blue, Green, and Mattapan lines.
```

**Description** (4,000 max):

```
NextTrain shows live times for Boston's subway, built for the trip you take every day.

YOUR COMMUTE, AT A GLANCE
Save the trips you take: your station, line, direction, and the time you usually leave. When it's time to go, the next train is waiting on the home screen, with any delay or suspension that affects it.

LIVE DEPARTURES
Every station shows its next trains for each line and direction, counting down in real time and refreshing every 10 seconds.

NEAR YOU
See the closest stations, how far a walk they are, and the next trains at the nearest one. Your location never leaves your phone.

SERVICE ALERTS
Delays, shuttle buses, suspensions, and station closures appear on the lines, stations, and commutes they affect.

LIVE LINE DIAGRAMS AND MAP
Watch every train move along its line, or across the whole system on the map, with arrows showing which way each one is heading.

SEARCH THAT GETS YOU
"harvard sq", "park st", "gov ctr": type it the way you say it.

PRIVATE BY DESIGN
No account, no ads, no tracking. Your commutes are saved under a random ID, and Settings → Delete my data erases everything.

Live data comes from the MBTA. NextTrain is an independent app and isn't affiliated with or endorsed by the MBTA.
```

## App Privacy answers

What the app does today (see `/privacy`). You submit the final answers in App Store Connect; these are the conservative reading.

| Data type | Collected? | Purpose | Linked to user | Tracking |
|---|---|---|---|---|
| Identifiers → User ID (the random ID created on the device) | Yes | App Functionality | Yes, it's what ties commutes to the device | No |
| User Content → Other User Content (saved commutes) | Yes | App Functionality | Yes | No |
| Location | **No**: only used on the device, never sent | – | – | – |
| Everything else (contact info, usage data, diagnostics, …) | No: no analytics, ads, or crash reporting | – | – | – |

Recently viewed stations stay on the device and aren't "collected". If you add crash reporting or analytics later, update these answers and the privacy policy.

## Review notes

Paste into **App Review Information → Notes**:

```
NextTrain shows live times for Boston's MBTA subway. No account or login is needed.

Reviewing from outside Boston? "Near you" will say you're outside the service area. Search for "Park Street" or open the Lines tab to see live departures, service alerts, and trains moving on each line.

Location permission is optional; it's only used on the device to find nearby stations. To try commutes: Home → Add a commute. Settings → Delete my data removes all saved data.
```

## Info.plist strings

| Key | Value |
|---|---|
| `NSLocationWhenInUseUsageDescription` | NextTrain uses your location to show the subway stations closest to you. Your location stays on your device. |
| `ITSAppUsesNonExemptEncryption` | `NO` (the app only uses standard HTTPS) |

## Before you submit

1. ~~Host the API and web app~~: done, on Azure at https://api.nexttrain.longledev.com and https://nexttrain.longledev.com (see the main README's Hosting section).
2. **Switch the map to Apple Maps** (MapKit JS; `GET /mapkit/token` is ready). OpenStreetMap's tile policy doesn't cover app traffic.
3. **Build the iPhone app** on a Mac. The Xcode project is already in `NextTrain.Web/ios`: iPhone-only, portrait, app icon, branded launch screen, and the Info.plist strings above. The bundle ID is `com.longledev.nexttrain`; it can't change after the first upload.
   ```
   cd NextTrain.Web
   npm ci
   VITE_API_URL=https://api.nexttrain.longledev.com npm run ios   # build the web app and copy it into the iOS project
   npx cap open ios                                    # opens Xcode: set your signing team, then Run or Archive
   ```
   For the Simulator against your local API, use `VITE_API_URL=http://localhost:5112` instead (the app allows local-network HTTP for this).
4. **Ship to TestFlight first** and try it on the subway, including the offline banner in a tunnel.

**Guideline 4.2 risk:** Apple rejects apps that are "just a website". NextTrain's native-feeling UI, location, offline handling, and live features help. Adding **push notifications for commutes** ("your train leaves in 5 minutes"; the `NotificationSubscription` table is ready) is the strongest answer if Review pushes back. Sign in with Apple is **not** required, because the app offers no third-party login.
