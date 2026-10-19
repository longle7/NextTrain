import { useEffect, useState, useSyncExternalStore } from 'react'
import { remember, remembered } from './cache'

interface PollState<T> {
  data: T | undefined
  error: Error | undefined
  updatedAt: Date | undefined
}

/**
 * Calls `fetcher` now and every `intervalMs` (if given) while mounted and visible, or until `key` changes. A poll
 * whose data is younger than `intervalMs` (remembered from another page, or from before the app went away) waits
 * until it's due instead of fetching again at once. `key` names what's fetched and is where it's remembered, so it must be unique per request: use its API path.
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
    let at = state.updatedAt // when what's showing was fetched: remembered on the device, or nothing yet
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () =>
      fetcher().then(
        (data) => {
          if (cancelled) return
          at = new Date()
          setState({ key, data, error: undefined, updatedAt: at })
          if (keep) remember(key, data)
        },
        (error: Error) => !cancelled && setState((s) => ({ ...s, key, error })),
      )
    // Loads unless what's showing is still fresh (another page fetched it moments ago, or the app was away only
    // briefly), then again when due. Never in the background: the next one waits for the app to be back on screen.
    const poll = () => {
      clearTimeout(timer)
      const wait = dueIn(at, intervalMs)
      if (wait === 0) load()
      if (intervalMs) timer = setTimeout(() => !document.hidden && poll(), wait || intervalMs)
    }
    poll()
    const onVisible = () => !document.hidden && intervalMs && poll()
    document.addEventListener('visibilitychange', onVisible)
    // Back online (e.g. out of a tunnel): refetch everything, including one-off loads that failed while offline.
    window.addEventListener('online', load)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', load)
    }
    // fetcher is recreated every render, so `key` (not fetcher) identifies what is being fetched; `state` is read
    // once, for the age of what this key starts with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])

  // Don't show the previous key's data while the new key loads.
  return state.key === key ? state : { data: undefined, error: undefined, updatedAt: undefined }
}

/**
 * How long until a poll every `intervalMs` is due, for data fetched `at`: 0 means now. A one-off load (no interval),
 * nothing fetched yet, or a time in the future (the phone's clock was changed) is always due.
 */
export function dueIn(at: Date | undefined, intervalMs: number | undefined, now = Date.now()): number {
  const age = at ? now - at.getTime() : -1
  return intervalMs && age >= 0 && age < intervalMs ? intervalMs - age : 0
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
