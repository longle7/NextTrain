import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { AppLogo, primaryButton } from './components'
import { EFFECTIVE_DATE } from './legal'

// Which version of the Terms this device agreed to. A new EFFECTIVE_DATE (legal.ts) asks again.
const ACCEPTED_KEY = 'nexttrain.termsAccepted'
const LEGAL_PAGES = ['/terms', '/privacy', '/cookies', '/support'] // readable before agreeing

function accepted() {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === EFFECTIVE_DATE
  } catch {
    return false // storage blocked: ask each visit, never assume agreement
  }
}

/**
 * First launch (and whenever the Terms change): what NextTrain is, the key limits (MBTA estimates, not affiliated),
 * and an explicit "Agree and continue" to the Terms of Use and Privacy Policy. An agreement people actively accept
 * (clickwrap) holds up far better than terms that are only linked somewhere.
 *
 * A native modal <dialog>: it traps focus and hides the app behind it from screen readers. Escape doesn't dismiss it
 * (agreeing is the way in). It steps aside on the legal pages themselves, so people can read them first.
 */
export default function Welcome() {
  const { pathname } = useLocation()
  const [agreed, setAgreed] = useState(accepted)
  const dialog = useRef<HTMLDialogElement>(null)
  const open = !agreed && !LEGAL_PAGES.includes(pathname)

  useEffect(() => {
    const d = dialog.current
    if (open && d && !d.open) {
      d.showModal()
      d.querySelector('button')?.focus() // showModal focuses the first link; the action is the button
    }
    if (!open && d?.open) d.close()
  }, [open])

  const agree = () => {
    try {
      localStorage.setItem(ACCEPTED_KEY, EFFECTIVE_DATE)
    } catch {
      // Can't remember it; it still counts for this visit.
    }
    setAgreed(true)
  }

  if (agreed) return null
  return (
    <dialog
      ref={dialog}
      aria-labelledby="welcome-title"
      onCancel={(event) => event.preventDefault()} // Escape: stay until they agree
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-neutral-900 shadow-xl backdrop:bg-black/60 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <AppLogo />
          <h2 id="welcome-title" className="text-xl font-bold">
            Welcome to NextTrain
          </h2>
        </div>
        <ul className="space-y-2 text-sm">
          <li>Live departures for every MBTA subway station and bus stop, with trains and buses moving on the map.</li>
          <li>Save your commutes to see your next train the moment you open the app.</li>
          <li>No account needed, and no ads.</li>
        </ul>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/60 dark:text-amber-50">
          Train times are estimates from MBTA data and can be late or wrong. Check official MBTA signs and announcements
          when timing matters. NextTrain is independent and isn't affiliated with the MBTA.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          By continuing, you agree to the{' '}
          <Link to="/terms" className="text-blue-700 underline dark:text-blue-300">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-blue-700 underline dark:text-blue-300">
            Privacy Policy
          </Link>
          .
        </p>
        <button onClick={agree} className={primaryButton}>
          Agree and continue
        </button>
      </div>
    </dialog>
  )
}
