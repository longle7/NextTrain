import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { api } from './api'

// Delay notifications (iPhone app only): when a major delay or closure hits one of your commutes, the API's
// DelayNotifier sends it through Apple. Here: asking iOS for permission, and giving our API this phone's push token.

/** 'on' or 'off' once the rider has chosen (the Home prompt or Settings); null before. Kept on this device. */
export type NotificationChoice = 'on' | 'off' | null

const KEY = 'nexttrain.notifications'

export const notificationsAvailable = () => Capacitor.isNativePlatform()

export function notificationChoice(): NotificationChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return null
  }
}

function remember(choice: NotificationChoice) {
  try {
    if (choice) localStorage.setItem(KEY, choice)
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: asked again next time
  }
}

// iOS hands over the token after register(), here, and again whenever it changes.
let listening: Promise<unknown> | undefined
const listen = () =>
  (listening ??= PushNotifications.addListener('registration', ({ value }) => {
    api('/me/push-token', { method: 'PUT', body: JSON.stringify({ token: value }) }).catch(() => {}) // retried next launch
  }))

/** Asks iOS (the first time), then registers. Resolves to whether notifications are on. */
export async function turnOnNotifications(): Promise<boolean> {
  const { receive } = await PushNotifications.requestPermissions()
  if (receive !== 'granted') return false
  remember('on')
  await listen()
  await PushNotifications.register()
  return true
}

/** Stops them: our API forgets this phone's token. */
export async function turnOffNotifications() {
  remember('off')
  await api('/me/push-token', { method: 'DELETE' })
}

/** "Not now" on the Home prompt: don't ask again (Settings can still turn them on). */
export const declineNotifications = () => remember('off')

/** After "Delete my data": the server already forgot the token, and the next commute asks again. */
export const forgetNotificationChoice = () => remember(null)

/** At launch: sends the token again if notifications are on, since iOS can change it. */
export async function refreshNotifications() {
  if (!notificationsAvailable() || notificationChoice() !== 'on') return
  if ((await PushNotifications.checkPermissions()).receive !== 'granted') return // turned off in iPhone Settings
  await listen()
  await PushNotifications.register()
}

/** Whether iOS blocks them (turned off in iPhone Settings → NextTrain → Notifications). */
export const notificationsBlocked = async () => (await PushNotifications.checkPermissions()).receive === 'denied'
