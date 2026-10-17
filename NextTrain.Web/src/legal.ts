import { readKey } from './cache'

// Facts the Privacy Policy, Terms of Use, and Cookie Policy share. Change them here, and update EFFECTIVE_DATE
// whenever the content of any of those pages changes.
export const OPERATOR = 'longledev'
export const CONTACT_EMAIL = 'privacy@longledev.com'
export const EFFECTIVE_DATE = 'October 17, 2026'
export const GOVERNING_STATE = 'Massachusetts'

// Which version of the Terms this device agreed to (Welcome.tsx asks). A new EFFECTIVE_DATE asks again.
export const ACCEPTED_KEY = 'nexttrain.termsAccepted'
export const termsAccepted = () => readKey(ACCEPTED_KEY) === EFFECTIVE_DATE // storage blocked: never assume agreement

/** Fired on window when someone agrees, so what waits for it (Home's Get started pop-up) can go on. */
export const TERMS_ACCEPTED = 'nexttrain:terms-accepted'

/** The legal pages, linked from each other and from Settings. */
export const legalPages = [
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Use'],
  ['/cookies', 'Cookie Policy'],
] as const
