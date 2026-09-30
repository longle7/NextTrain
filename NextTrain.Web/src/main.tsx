import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startAnalyticsIfAllowed } from './analytics'
import './index.css'

// In the iPhone app, act like native UI (see index.css). The website is unaffected.
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native')

// Only if this visitor already chose Allow (see analytics.ts); otherwise nothing loads.
startAnalyticsIfAllowed()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
