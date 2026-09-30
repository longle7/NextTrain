import { CONTACT_EMAIL } from '../legal'
import { ContactEmail, ExternalLink, InternalLink, Section } from './LegalLayout'
import { useTitle } from '../usePolling'

// The App Store's Support URL: a way to reach us, plus answers to what people ask most.
export default function SupportPage() {
  useTitle('Help & support')
  return (
    <article className="space-y-5 pb-4">
      <h1 className="text-2xl font-bold">Help &amp; support</h1>

      <Section title="Contact us">
        <p>
          Email <ContactEmail /> with questions, problems, or ideas. Tell us what you were doing and, if you can, the
          station or line. We usually reply within a few days.
        </p>
        <p className="text-sm text-neutral-500">
          Copy the address: <span className="font-mono select-all">{CONTACT_EMAIL}</span>
        </p>
      </Section>

      <Section title="Service problems and emergencies">
        <p>
          NextTrain can't help with delays, lost items, or safety on the T. For those, contact the MBTA directly:{' '}
          <ExternalLink href="https://www.mbta.com/customer-support">MBTA customer support</ExternalLink>. In an
          emergency, call 911.
        </p>
      </Section>

      <Section title="Common questions">
        <dl className="space-y-3">
          <div>
            <dt className="font-semibold">A time looks wrong, or a train never came.</dt>
            <dd>
              Times are the MBTA's live predictions, and they change with delays, shuttles, and service changes. Check the
              station's alerts in NextTrain and the signs in the station. If a time is consistently off, email us.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Why does NextTrain want my location?</dt>
            <dd>
              Only to find the stations near you and show where you are on the map. It stays on your device and is never
              sent to us. NextTrain works without it; you can turn it off in your phone's settings.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">How do I delete my data?</dt>
            <dd>
              Settings → Delete my data removes your saved commutes from our server right away and clears what NextTrain
              stored on your device. Or email us.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Why no crowding information for my train?</dt>
            <dd>The MBTA reports crowding only for some trains today (Orange Line and the newer Red Line cars).</dd>
          </div>
        </dl>
      </Section>

      <p className="text-sm text-neutral-500">
        See also the <InternalLink to="/terms">Terms of Use</InternalLink> and{' '}
        <InternalLink to="/privacy">Privacy Policy</InternalLink>.
      </p>
    </article>
  )
}
