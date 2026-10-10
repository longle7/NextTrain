import { OPERATOR } from '../legal'
import { ContactEmail, ExternalLink, InternalLink, LegalPage, Section } from './LegalLayout'

// Keep this in step with what the app actually does (and bump EFFECTIVE_DATE in legal.ts when it changes). This
// page's URL is the Privacy Policy URL in App Store Connect. Not legal advice: have a lawyer review it.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        NextTrain shows live MBTA subway and bus times. It's operated by {OPERATOR} ("we", "us") and built to collect as little
        about you as possible: there are no accounts, no ads, and we never sell or share your personal information.
      </p>

      <Section title="What we collect, and why">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Saved commutes.</strong> The station, line, direction, times, and days of commutes you save, so we can
            show them to you. They're stored on our server under a random ID the app creates on your device, not your
            name, email, phone number, or Apple ID. We keep them until you delete them.
          </li>
          <li>
            <strong>Your location.</strong> "Near you" and the map's locate button use your location on your device only,
            to sort stations by distance and center the map. It's never sent to our servers. You can turn location access
            off at any time; the rest of NextTrain keeps working.
          </li>
          <li>
            <strong>Analytics, only if you allow it, and only on the website.</strong> If you choose Allow in the cookie
            notice, the website uses Google Analytics to count which pages are viewed, with the page, a rough location
            (city and country, which Google works out from your IP address; Google Analytics doesn't store IP addresses),
            your device and browser type, screen size, language, and the site that sent you. Page addresses are cleaned
            first, so they never include your commute's ID. Google Signals and advertising features are turned off. The
            iPhone app has no analytics. See the <InternalLink to="/cookies">Cookie Policy</InternalLink>.
          </li>
          <li>
            <strong>Technical data.</strong> Like any website, our hosting receives your IP address and basic request
            details (such as the page requested and your browser type) in order to deliver NextTrain and keep it secure. We
            don't keep request logs ourselves. When something goes wrong on our server, it records the error (never your IP
            address or your commutes) for up to 30 days so we can fix it.
          </li>
          <li>
            <strong>Messages you send us.</strong> If you email us or report a problem on GitHub, we receive what you send,
            and use it only to reply and improve NextTrain.
          </li>
        </ul>
      </Section>

      <Section title="What we don't do">
        <p>
          We don't sell your personal information or share it for cross-context behavioral advertising, don't show ads,
          don't track you across other companies' apps or websites, and don't use data brokers.
        </p>
      </Section>

      <Section title="Services that handle data for us">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Microsoft Azure</strong> hosts the website, our server, and its database, in the United States.{' '}
            <ExternalLink href="https://privacy.microsoft.com/en-us/privacystatement">Microsoft's privacy statement</ExternalLink>
          </li>
          <li>
            <strong>Cloudflare</strong> protects the website and our server from attacks and automated abuse, and runs our
            domain's DNS and email forwarding. Every request to NextTrain passes through Cloudflare, which receives your IP
            address and the request details, may set security cookies on the website (see the{' '}
            <InternalLink to="/cookies">Cookie Policy</InternalLink>), and keeps short-lived records of blocked or suspicious
            requests.{' '}
            <ExternalLink href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</ExternalLink>
          </li>
          <li>
            <strong>Apple Maps</strong> draws the map. Map images load from Apple's servers, which receive your IP address
            and the part of the map you're viewing (after you tap the locate button, that's the area around you). Your exact
            location isn't sent: the blue dot is placed on your device.{' '}
            <ExternalLink href="https://www.apple.com/legal/privacy/">Apple's privacy policy</ExternalLink>
          </li>
          <li>
            <strong>Google Analytics</strong>, only on the website and only if you allow it (see above).{' '}
            <ExternalLink href="https://policies.google.com/technologies/partner-sites">
              How Google uses information from sites that use its services
            </ExternalLink>
          </li>
          <li>
            <strong>The MBTA</strong> provides the train times. Our server fetches them for you, so your device doesn't
            contact the MBTA and the MBTA receives nothing about you.
          </li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <p>
          Saved commutes: until you delete them (see below). Analytics: Google keeps it for 2 months. Messages: as long as
          needed to answer them. Data on your device stays until you delete it or the app.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Delete your data now:</strong> Settings → Delete my data removes your saved commutes from our server
            right away, and clears your analytics choice on this device. Deleting the app removes its
            ID from your device, but not commutes already saved on our server, so use Delete my data first.
          </li>
          <li>
            <strong>Analytics:</strong> change your choice at any time in Settings. Turning it off deletes the Google
            Analytics cookies from your browser.
          </li>
          <li>
            <strong>Privacy signals:</strong> if your browser sends Global Privacy Control or Do Not Track, we treat it as
            a no to analytics, and never ask.
          </li>
          <li>
            <strong>Access, correction, and deletion:</strong> depending on where you live (for example California, other
            US states, the European Economic Area, or the UK), you may have the right to know what personal information we
            have about you, and to get a copy of it, correct it, delete it, or object to or restrict how we use it. You can
            also withdraw consent at any time. Email <ContactEmail />. We'll answer within 30 days (45 where the law allows
            more time). Because we don't know who you are, we may ask you to use Delete my data, which works instantly. We
            won't treat you differently for using these rights.
          </li>
          <li>
            If you're in the EEA or UK, you can also complain to your local data protection authority. We use your data to
            provide the features you use (saved commutes), with your consent (analytics), and for our legitimate interest
            in keeping NextTrain secure.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          All connections use encryption (HTTPS). Our keys and passwords are stored as encrypted secrets, never in our
          code. We collect little to begin with, so there's little to protect.
        </p>
      </Section>

      <Section title="Where your data is stored">
        <p>In the United States. If you use NextTrain from elsewhere, your data is transferred to and stored in the US.</p>
      </Section>

      <Section title="Children">
        <p>
          NextTrain isn't directed at children under 13 and doesn't knowingly collect their personal information. If you
          believe a child has given us personal information, email <ContactEmail /> and we'll delete it.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, we'll update this page and the date above, and tell you in the app if the change is
          significant. Questions or requests: <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  )
}
