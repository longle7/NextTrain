import { useEffect, useState, useSyncExternalStore } from 'react'
import { remember, remembered } from './cache'

interface PollState<T> {
  data: T | undefined
  error: Error | undefined
  updatedAt: Date | undefined
}

/**
 * Calls `fetcher` now and every `intervalMs` (if given) while mounted and visible, or until `key` changes.
 * `key` names what's fetched and is where it's remembered, so it must be unique per request: use its API path.
 * Keeps the last good data when a refresh fails. With `remember` (the default), the last good data is also kept on
 * the device and shown at once on the next visit, even offline; `updatedAt` says how old it is.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  key: string,
  intervalMs?: number,
  { remember: keep = true }: { remember?: boolean } = {},
): PollState<T> {
  const start = (k: string) => ({ key: k, error: undefined, ...((keep && remembered<T>(k)) || { data: undefined, updatedAt: undefined }) })
  const [state, setState] = useState<PollState<T> & { key: string }>(() => start(key))
  // A new key starts from what's remembered for it, not the previous key's data.
  if (state.key !== key) setState(start(key))

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetcher().then(
        (data) => {
          if (cancelled) return
          setState({ key, data, error: undefined, updatedAt: new Date() })
          if (keep) remember(key, data)
        },
        (error: Error) => !cancelled && setState((s) => ({ ...s, key, error })),
      )
    load()
    // Don't poll in the background; refresh as soon as the app is back on screen (iOS pauses timers anyway).
    const timer = intervalMs ? setInterval(() => !document.hidden && load(), intervalMs) : undefined
    const onVisible = () => !document.hidden && intervalMs && load()
    document.addEventListener('visibilitychange', onVisible)
    // Back online (e.g. out of a tunnel): refetch everything, including one-off loads that failed while offline.
    window.addEventListener('online', load)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', load)
    }
    // fetcher is recreated every render, so `key` (not fetcher) identifies what is being fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])

  // Don't show the previous key's data while the new key loads.
  return state.key === key ? state : { data: undefined, error: undefined, updatedAt: undefined }
}

/** The error worth a red box: only when there's nothing to show. With last-known data, pages say how old it is instead. */
export const failure = <T,>(poll: PollState<T>) => (poll.data === undefined ? poll.error : undefined)

/** Current time, updated every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Whether the device has a network connection, updated as it comes and goes. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** The browser tab / history title: "Park Street · NextTrain" (VoiceOver announces it on navigation). */
export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · NextTrain` : 'NextTrain'
  }, [title])
}
