import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, forgetUserId } from '../api'
import { Card, dangerButton } from '../components'

const SUPPORT_URL = 'https://github.com/longle7/NextTrain/issues'

export default function SettingsPage() {
  const [deletion, setDeletion] = useState<'idle' | 'deleting' | 'done' | 'failed'>('idle')

  const deleteMyData = async () => {
    if (!confirm("Delete your saved commutes from NextTrain? This can't be undone.")) return
    setDeletion('deleting')
    try {
      await api('/me', { method: 'DELETE' })
      forgetUserId()
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
            name, email, or location.
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

      <Section title="About">
        <ul className="divide-y divide-neutral-100 rounded-xl bg-white shadow-sm dark:divide-neutral-800 dark:bg-neutral-900">
          <Row>
            <Link to="/privacy" className="flex min-h-12 flex-1 items-center justify-between">
              Privacy policy <Chevron />
            </Link>
          </Row>
          <Row>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 items-center justify-between">
              Report a problem <Chevron />
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
        Live train data from the MBTA. NextTrain is an independent app and isn't affiliated with or endorsed by the MBTA. Map
        data © OpenStreetMap contributors.
      </p>
    </>
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
