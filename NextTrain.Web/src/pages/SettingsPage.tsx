import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { analyticsBlocked, forgetAnalyticsChoice, setAnalyticsChoice, useAnalyticsChoice } from '../analytics'
import { api, forgetUserId } from '../api'
import { Card, dangerButton } from '../components'
import { forgetRecentStations } from '../recent'
import { useTitle } from '../usePolling'

const SUPPORT_URL = 'https://github.com/longle7/NextTrain/issues'

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
      forgetAnalyticsChoice()
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
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 items-center justify-between">
              <span>
                Report a problem<span className="sr-only"> (opens GitHub)</span>
              </span>
              <Chevron />
            </a>
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
        independent app and isn't affiliated with or endorsed by MassDOT or the MBTA. Maps by Apple.
      </p>
    </>
  )
}

// The website's analytics switch. Not shown where analytics can't run (the iPhone app, or no analytics set up).
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
