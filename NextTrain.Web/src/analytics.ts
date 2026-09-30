import { Capacitor } from '@capacitor/core'
import { useSyncExternalStore } from 'react'

/**
 * Google Analytics, only with consent. Nothing is loaded and nothing is sent to Google unless all of these hold:
 *   - the website build has a measurement ID (VITE_GA_ID, e.g. G-ABC123). No ID means no analytics at all.
 *   - it's the website, not the iPhone app (the app has no analytics, so its App Store privacy label stays short).
 *   - the browser isn't asking not to be tracked (Global Privacy Control or Do Not Track): we honor both.
 *   - the person chose "Allow" in the cookie banner or Settings. Until then, nothing is loaded.
 * Even then: no Google Signals, no ad personalization, no user ID, and page paths are cleaned of anything personal.
 */

const GA_ID = import.meta.env.VITE_GA_ID
const CONSENT_KEY = 'nexttrain.analyticsConsent'
const COOKIE_DAYS = 395 // about 13 months, the longest many EU regulators accept for analytics cookies

export type Choice = 'granted' | 'denied'

/** Why analytics can't run here, or undefined if it can (once the person agrees). */
export function analyticsBlocked(): 'unavailable' | 'privacy-signal' | undefined {
  if (!GA_ID || !/^G-[A-Z0-9]+$/.test(GA_ID) || Capacitor.isNativePlatform()) return 'unavailable'
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return 'privacy-signal'
}

function storedChoice(): Choice | undefined {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : undefined
  } catch {
    return undefined // storage blocked: ask again next visit, and never assume a yes
  }
}

/** The person's choice, re-rendering when it changes (banner and Settings stay in step). */
export function useAnalyticsChoice(): Choice | undefined {
  return useSyncExternalStore(subscribe, storedChoice)
}

const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Records the choice and starts or stops analytics to match. */
export function setAnalyticsChoice(choice: Choice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // Can't remember it; it still applies for this visit.
  }
  if (choice === 'granted') start()
  else stop()
  listeners.forEach((listener) => listener())
}

/** Delete my data: forgets the choice (the banner asks again) and deletes the analytics cookies. */
export function forgetAnalyticsChoice() {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Nothing stored.
  }
  stop()
  listeners.forEach((listener) => listener())
}

/** At startup: resumes analytics for someone who already said yes (and nothing otherwise). */
export function startAnalyticsIfAllowed() {
  if (storedChoice() === 'granted') start()
}

/** "/commutes/42?x=1" -> "/commutes/:id": no IDs, queries, or fragments leave the device. */
export function cleanPath(path: string): string {
  return path.split(/[?#]/)[0].replace(/^\/commutes\/(?!new$)[^/]+/, '/commutes/:id')
}

/** Counts a page view, if analytics is running. Called after each navigation. */
let lastPage: string | undefined
export function trackPageView(path: string) {
  if (!running || path === lastPage) return // the same page twice in a row is one view (React dev runs effects twice)
  lastPage = path
  // After the new page has set its title (its effect runs after the navigation effect).
  setTimeout(() => {
    const page = cleanPath(path)
    gtag('event', 'page_view', { page_path: page, page_location: location.origin + page, page_title: document.title })
  })
}

let loaded = false
let running = false

declare global {
  interface Window {
    dataLayer: unknown[]
    [key: `ga-disable-${string}`]: boolean
  }
}
// Google's documented snippet: queue calls on dataLayer until gtag.js loads and processes them. It must push the
// `arguments` object itself: gtag.js treats a plain array differently, and the call would be silently ignored.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

function start() {
  if (analyticsBlocked() || running) return
  running = true
  window[`ga-disable-${GA_ID!}`] = false
  if (loaded) {
    gtag('consent', 'update', { analytics_storage: 'granted' })
    return
  }
  loaded = true
  window.dataLayer = window.dataLayer || []
  gtag('consent', 'default', {
    analytics_storage: 'granted', // the person said yes
    ad_storage: 'denied', // no advertising, ever
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag('js', new Date())
  gtag('config', GA_ID, {
    send_page_view: false, // trackPageView sends cleaned paths instead
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: location.hostname, // this site only, not other longledev.com sites
    cookie_expires: COOKIE_DAYS * 24 * 60 * 60,
    cookie_flags: 'SameSite=Lax;Secure',
  })
  const script = Object.assign(document.createElement('script'), {
    src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID!)}`,
    async: true,
  })
  document.head.append(script)
  trackPageView(location.pathname)
}

// Withdrawing consent: stop sending, and delete Google Analytics' cookies from this device.
function stop() {
  running = false
  if (!GA_ID) return
  window[`ga-disable-${GA_ID}`] = true // gtag.js's own off switch
  if (loaded) gtag('consent', 'update', { analytics_storage: 'denied' })
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim()
    if (name === '_ga' || name.startsWith('_ga_')) {
      for (const domain of ['', `; domain=${location.hostname}`, `; domain=.${location.hostname}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}`
      }
    }
  }
}
