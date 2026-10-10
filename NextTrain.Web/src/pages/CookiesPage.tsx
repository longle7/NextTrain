import { ContactEmail, ExternalLink, InternalLink, LegalPage, Section } from './LegalLayout'

// List every cookie and storage item NextTrain uses; keep in step with analytics.ts, api.ts, Welcome.tsx, and MapPage.tsx.
// Not legal advice: have a lawyer review it. Bump EFFECTIVE_DATE in legal.ts when it changes.
export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        Cookies and similar storage are small pieces of data a website keeps in your browser. NextTrain uses as few as
        possible: only what it needs to work and stay secure, plus analytics cookies on the website if you allow them.
      </p>

      <Section title="Needed for NextTrain to work">
        <p>These are stored on your device, aren't cookies, and aren't used for tracking. They don't need your consent.</p>
        <StorageTable
          rows={[
            ['nexttrain.userId', 'A random ID that your saved commutes are stored under', 'Until you use Delete my data'],
            ['nexttrain.analyticsConsent', 'Remembers your analytics choice, so we don\'t ask again', 'Until you use Delete my data'],
            ['nexttrain.cache.*', 'The last train times, stations, alerts, and commutes NextTrain loaded, so it can show them (with their age) when you open it offline, e.g. in a tunnel', 'Until newer data replaces it, or you use Delete my data'],
            ['nexttrain.mapTipSeen', 'Remembers that you closed the map\'s tip, so it doesn\'t show again', 'Until you delete the app or clear site data'],
            ['nexttrain.termsAccepted', 'Remembers which version of the Terms you agreed to, so we only ask again when they change', 'Until you delete the app or clear site data'],
          ]}
        />
      </Section>

      <Section title="Security cookies (website only)">
        <p>
          Cloudflare, which protects NextTrain from attacks and automated abuse, may set these on nexttrain.longledev.com.
          They're strictly necessary for security, so they don't need your consent, and they aren't used for advertising or
          to track you across sites. The iPhone app doesn't receive them.{' '}
          <ExternalLink href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/">
            Cloudflare's cookies
          </ExternalLink>
        </p>
        <StorageTable
          rows={[
            ['__cf_bm', 'Tells people apart from automated bots', '30 minutes after your last visit'],
            ['cf_clearance', "Remembers that you passed a security check, so you aren't asked again", '30 minutes'],
          ]}
        />
      </Section>

      <Section title="Analytics cookies (optional, website only)">
        <p>
          Only if you choose Allow, Google Analytics sets these cookies on nexttrain.longledev.com to count visits and
          see which pages are used. Google Signals and advertising features are off. See the{' '}
          <InternalLink to="/privacy">Privacy Policy</InternalLink> for what's collected.
        </p>
        <StorageTable
          rows={[
            ['_ga', 'Tells visits by the same browser apart (a random number, not your identity)', '13 months'],
            ['_ga_<ID>', 'Keeps track of the current visit', '13 months'],
          ]}
        />
        <p>
          The iPhone app doesn't use analytics or cookies. Apple Maps doesn't set cookies on NextTrain.{' '}
          <ExternalLink href="https://policies.google.com/technologies/cookies">How Google uses cookies</ExternalLink>
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Change your analytics choice at any time in <InternalLink to="/settings">Settings</InternalLink>. Turning it
            off deletes the analytics cookies.
          </li>
          <li>If your browser sends Global Privacy Control or Do Not Track, analytics stays off and we don't ask.</li>
          <li>
            You can also block or delete cookies in your browser's settings. NextTrain works the same without analytics
            cookies.
          </li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          Questions: <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  )
}

function StorageTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Purpose</th>
            <th scope="col" className="py-2 font-semibold">Kept for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose, duration]) => (
            <tr key={name} className="border-b border-neutral-100 align-top dark:border-neutral-900">
              <td className="py-2 pr-3 font-mono text-xs break-all">{name}</td>
              <td className="py-2 pr-3">{purpose}</td>
              <td className="py-2">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
