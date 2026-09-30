// Injected by vite.config.ts from package.json.
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  // Base URL of the NextTrain API for builds that aren't served next to it (the iPhone app). Defaults to /api.
  readonly VITE_API_URL?: string
  // Google Analytics 4 measurement ID (G-...) for the website build only. Unset: no analytics, no cookie banner.
  readonly VITE_GA_ID?: string
}

// Global Privacy Control (https://globalprivacycontrol.org): a browser's "don't sell or share my data" signal.
interface Navigator {
  readonly globalPrivacyControl?: boolean
}
