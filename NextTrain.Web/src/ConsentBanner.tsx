import { Link } from 'react-router'
import { analyticsBlocked, setAnalyticsChoice, useAnalyticsChoice } from './analytics'

const choiceButton =
  'min-h-11 rounded-xl bg-neutral-100 px-3 font-semibold text-neutral-900 active:opacity-70 dark:bg-neutral-800 dark:text-white'

/**
 * Asks before any analytics cookie is set (see analytics.ts). "Reject" is exactly as easy as "Allow", as EU rules
 * require; the app works the same either way, and the choice can be changed in Settings. Not a modal: the app stays
 * usable. Sticky at the end of the page (above the tab bar), so it's always in view yet takes up its own space: it
 * never hides the end of a page, however tall it gets.
 */
export default function ConsentBanner() {
  // Only where analytics could run, and only until this visitor chooses.
  if (useAnalyticsChoice() !== undefined || analyticsBlocked()) return null
  return (
    <section aria-labelledby="consent-title" className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20">
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/15">
        <h2 id="consent-title" className="font-semibold">
          Allow analytics cookies?
        </h2>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          We'd like to use Google Analytics cookies to see which features people use, so we can improve NextTrain. It's
          optional and the app works the same either way. No ads, and we never sell your data.{' '}
          <Link to="/cookies" className="text-blue-700 underline dark:text-blue-300">
            Cookie Policy
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAnalyticsChoice('denied')} className={choiceButton}>
            Reject
          </button>
          <button onClick={() => setAnalyticsChoice('granted')} className={choiceButton}>
            Allow
          </button>
        </div>
      </div>
    </section>
  )
}
