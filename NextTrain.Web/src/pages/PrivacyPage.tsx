import type { ReactNode } from 'react'
import { useTitle } from '../usePolling'

// Keep this in step with what the app actually does. Once the web app is hosted, this page's URL is the
// "Privacy Policy URL" App Store Connect asks for.
export default function PrivacyPage() {
  useTitle('Privacy policy')
  return (
    <article className="space-y-4 pb-4">
      <div>
        <h1 className="text-2xl font-bold">Privacy policy</h1>
        <p className="text-sm text-neutral-500">Effective September 29, 2026</p>
      </div>

      <p>NextTrain shows live MBTA subway times. It's built to collect as little about you as possible.</p>

      <Section title="What we store">
        <p>
          Only the commutes you save: the station, line, direction, times, and days you choose. They're linked to a random ID
          that the app creates on your device, not to your name, email, phone number, or Apple ID.
        </p>
        <p>
          The last few stations you looked at are remembered on your device only, to list them on Home. They're never sent
          to us.
        </p>
        <p>There are no accounts, no ads, and no analytics or tracking.</p>
      </Section>

      <Section title="Your location">
        <p>
          "Near you" and the map's locate button use your location on your device only, to sort stations by distance and
          center the map. Your location is never sent to NextTrain's servers. You can turn location access off at any time;
          the rest of the app keeps working.
        </p>
      </Section>

      <Section title="Services we use">
        <p>
          Train times come from the MBTA's public data. Our server fetches them for you, so your device doesn't contact the
          MBTA directly.
        </p>
        <p>
          Map images load from OpenStreetMap's servers, which receive your IP address and the part of the map you're viewing.
          See the{' '}
          <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">
            OpenStreetMap Foundation privacy policy
          </a>
          .
        </p>
        <p>
          Like any online service, our hosting may keep short-lived technical logs, such as IP addresses, to keep NextTrain
          running and secure.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Settings → Delete my data removes your saved commutes from our server right away and clears your recent stations
          on this device. Deleting the app removes its ID from your device, but not commutes already saved on our server,
          so use Delete my data first.
        </p>
      </Section>

      <Section title="Children">
        <p>NextTrain isn't directed at children under 13 and doesn't knowingly collect their information.</p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, we'll update this page and the date above. Questions? Open an issue at{' '}
          <a href="https://github.com/longle7/NextTrain/issues" target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">
            github.com/longle7/NextTrain
          </a>
          .
        </p>
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-neutral-700 dark:text-neutral-300">{children}</div>
    </section>
  )
}
