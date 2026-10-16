import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startAnalyticsIfAllowed } from './analytics'
import { startErrorReports } from './errors'
import { sendLiveActivityTokens } from './liveActivity'
import { refreshNotifications } from './notifications'
import './index.css'

// In the iPhone app, act like native UI (see index.css). The website is unaffected.
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native')

// Recently viewed stations were removed from NextTrain; clear what earlier versions stored.
try {
  localStorage.removeItem('nexttrain.recentStations')
} catch {
  // storage blocked: nothing stored
}

// Errors are reported (production builds only; see errors.ts and the Privacy Policy).
startErrorReports()

// Only if this visitor already chose Allow (see analytics.ts); otherwise nothing loads.
startAnalyticsIfAllowed()

// iPhone app with delay notifications on: give our API this phone's current push token (iOS can change it).
void refreshNotifications().catch(() => {})
sendLiveActivityTokens()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
