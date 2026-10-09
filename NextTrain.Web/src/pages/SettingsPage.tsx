import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { analyticsBlocked, forgetAnalyticsChoice, setAnalyticsChoice, useAnalyticsChoice } from '../analytics'
import { forgetRemembered } from '../cache'
import { api, commutePredictionsPath, forgetUserId, getRoutes, type Commute, type Prediction } from '../api'
import { sortCommutes } from '../commutes'
import { Card, dangerButton, primaryButton } from '../components'
import { endLiveActivities, liveActivitiesAvailable, liveActivityDetails, showLiveActivity } from '../liveActivity'
import { forgetRecentStations } from '../recent'
import { groupDepartures } from '../time'
import { useTitle } from '../usePolling'

export default function SettingsPage() {
  const [deletion, setDeletion] = useState<'idle' | 'deleting' | 'done' | 'failed'>('idle')
  useTitle('Settings')

  const deleteMyData = async () => {
    if (!confirm("Delete your saved commutes from NextTrain? This can't be undone.")) return
    setDeletion('deleting')
    try {
      await api('/me', { method: 'DELETE' })
      forgetUserId()
      forgetRecentStations()
      forgetRemembered()
      forgetAnalyticsChoice()
      void endLiveActivities()
      setDeletion('done')
    } catch {
      setDeletion('failed')
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Your data">
        <Card>
          <p className="text-sm text-neutral-500">
            NextTrain has no accounts. Your saved commutes are stored under a random ID created on this device, never your
            name, email, or location. Recently viewed stations stay on this device. Delete my data removes your commutes
            from our server and clears everything NextTrain stored on this device, including your analytics choice.
          </p>
          <button onClick={deleteMyData} disabled={deletion === 'deleting'} className={`mt-2 ${dangerButton}`}>
            {deletion === 'deleting' ? 'Deleting…' : 'Delete my data'}
          </button>
          <p role="status" className="text-center text-sm text-neutral-500">
            {deletion === 'done' && 'Your data was deleted.'}
            {deletion === 'failed' && "Couldn't delete your data. Check your connection and try again."}
          </p>
        </Card>
      </Section>

      <LiveActivities />

      <AnalyticsChoice />

      <Section title="Legal">
        <ul className="divide-y divide-neutral-100 rounded-xl bg-white shadow-sm dark:divide-neutral-800 dark:bg-neutral-900">
          {[
            ['/privacy', 'Privacy Policy'],
            ['/terms', 'Terms of Use'],
            ['/cookies', 'Cookie Policy'],
          ].map(([to, label]) => (
            <Row key={to}>
              <Link to={to} className="flex min-h-12 flex-1 items-center justify-between">
                {label} <Chevron />
              </Link>
            </Row>
          ))}
        </ul>
      </Section>

      <Section title="About">
        <ul className="divide-y divide-neutral-100 rounded-xl bg-white shadow-sm dark:divide-neutral-800 dark:bg-neutral-900">
          <Row>
            <Link to="/support" className="flex min-h-12 flex-1 items-center justify-between">
              Help &amp; support <Chevron />
            </Link>
          </Row>
          <Row>
            <span className="flex min-h-12 flex-1 items-center justify-between">
              Version <span className="text-neutral-500">{__APP_VERSION__}</span>
            </span>
          </Row>
        </ul>
      </Section>

      <p className="px-1 text-xs text-neutral-500">
        {/* The MassDOT developer license requires clearly acknowledging MassDOT as the provider of the data. */}
        Transit data provided by the Massachusetts Department of Transportation (MassDOT) and the MBTA. NextTrain is an
        independent app and isn't affiliated with or endorsed by MassDOT or the MBTA. MBTA is a trademark of MassDOT, used
        here only to describe the service. Maps by Apple.
      </p>
    </>
  )
}

// The website's analytics switch. Not shown where analytics can't run (the iPhone app, or no analytics set up).
// iPhone app only. iOS has the on/off switch itself (Settings → NextTrain → Live Activities), so there's none here.
function LiveActivities() {
  const [available, setAvailable] = useState(false)
  const [preview, setPreview] = useState<'idle' | 'starting' | 'shown' | 'no-commute' | 'failed'>('idle')
  useEffect(() => {
    void liveActivitiesAvailable().then(setAvailable)
  }, [])
  if (!available) return null

  // Shows your soonest commute's live trains now, whatever the time, so you can see what it looks like.
  const showPreview = async () => {
    setPreview('starting')
    try {
      const [commutes, routes] = await Promise.all([api<Commute[]>('/commutes'), getRoutes()])
      const commute = sortCommutes(commutes, new Date())[0]
      if (!commute) return setPreview('no-commute')
      const predictions = await api<Prediction[]>(commutePredictionsPath(commute))
      const departures = groupDepartures(predictions, new Date())[0]?.departures ?? []
      const route = routes.find((r) => r.id === commute.routeId)
      const endsAt = new Date(Date.now() + 5 * 60_000)
      setPreview((await showLiveActivity(liveActivityDetails(commute, route, departures, endsAt, undefined))) ? 'shown' : 'failed')
    } catch {
      setPreview('failed')
    }
  }

  return (
    <Section title="Live Activities">
      <Card>
        <p className="text-sm text-neutral-500">
          From 15 minutes before a saved commute until it ends, its next trains or buses count down on your Lock Screen and in the
          Dynamic Island. Turn this off in iPhone Settings → NextTrain → Live Activities.
        </p>
        <button onClick={showPreview} disabled={preview === 'starting'} className={`mt-2 ${primaryButton}`}>
          Preview Live Activity
        </button>
        <p role="status" className="text-center text-sm text-neutral-500">
          {preview === 'shown' && 'Lock your iPhone to see it.'}
          {preview === 'no-commute' && 'Add a commute first, then preview it here.'}
          {preview === 'failed' && "Couldn't show it. Check that Live Activities are on for NextTrain in iPhone Settings."}
        </p>
      </Card>
    </Section>
  )
}

function AnalyticsChoice() {
  const choice = useAnalyticsChoice()
  const blocked = analyticsBlocked()
  if (blocked === 'unavailable') return null
  const on = choice === 'granted' && !blocked
  return (
    <Section title="Privacy choices">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span id="analytics-label" className="font-semibold">
            Analytics cookies
          </span>
          <button
            role="switch"
            aria-checked={on}
            aria-labelledby="analytics-label"
            aria-describedby="analytics-help"
            disabled={!!blocked}
            onClick={() => setAnalyticsChoice(on ? 'denied' : 'granted')}
            className={`relative h-8 w-13 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}
          >
            <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <p id="analytics-help" className="mt-2 text-sm text-neutral-500">
          {blocked === 'privacy-signal'
            ? "Off: your browser asks sites not to track you (Global Privacy Control or Do Not Track), so NextTrain doesn't use analytics."
            : 'Google Analytics helps us see which features people use. No ads, and we never sell your data. Turning this off deletes the analytics cookies.'}
        </p>
      </Card>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-neutral-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}

const Row = ({ children }: { children: ReactNode }) => <li className="flex px-4">{children}</li>

const Chevron = () => (
  <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-neutral-400 stroke-2" aria-hidden>
    <path d="m9 5 7 7-7 7" />
  </svg>
)
