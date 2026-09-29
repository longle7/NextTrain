import { useEffect, useState } from 'react'

interface PollState<T> {
  data: T | undefined
  error: Error | undefined
  updatedAt: Date | undefined
}

/**
 * Calls `fetcher` now and every `intervalMs` (if given) while mounted and visible, or until `key` changes.
 * Keeps the last good data when a refresh fails.
 */
export function usePolling<T>(fetcher: () => Promise<T>, key: string, intervalMs?: number): PollState<T> {
  const [state, setState] = useState<PollState<T> & { key: string }>({
    key, data: undefined, error: undefined, updatedAt: undefined,
  })

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetcher().then(
        (data) => !cancelled && setState({ key, data, error: undefined, updatedAt: new Date() }),
        (error: Error) => !cancelled && setState((s) => ({ ...s, key, error })),
      )
    load()
    // Don't poll in the background; refresh as soon as the app is back on screen (iOS pauses timers anyway).
    const timer = intervalMs ? setInterval(() => !document.hidden && load(), intervalMs) : undefined
    const onVisible = () => !document.hidden && intervalMs && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // fetcher is recreated every render, so `key` (not fetcher) identifies what is being fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])

  // Don't show the previous key's data while the new key loads.
  return state.key === key ? state : { data: undefined, error: undefined, updatedAt: undefined }
}

/** Current time, updated every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
