import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone app: this web app in a native shell. On a Mac: `npm run ios` (build + sync), then run from Xcode.
// appId is the App Store bundle ID and can't change after the first upload, so pick your final one before that.
const config: CapacitorConfig = {
  appId: 'com.longledev.nexttrain',
  appName: 'NextTrain',
  webDir: 'dist',
  backgroundColor: '#171717', // matches the header, so launch and overscroll never flash white
}

export default config
