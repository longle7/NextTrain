import { GOVERNING_STATE, OPERATOR } from '../legal'
import { ContactEmail, ExternalLink, InternalLink, LegalPage, Section } from './LegalLayout'

// Not legal advice: have a lawyer review it. Bump EFFECTIVE_DATE in legal.ts when it changes.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms are an agreement between you and {OPERATOR} ("we", "us"), which operates NextTrain. By using the
        NextTrain website or app, you agree to them. If you don't agree, please don't use NextTrain.
      </p>

      <Section title="What NextTrain is">
        <p>
          NextTrain is a free app that shows MBTA subway arrival predictions, service alerts, and train positions. It's
          for general information only. Train times come from the MBTA and can be late, wrong, or missing: service
          changes, delays, and outages happen. Don't rely on NextTrain where timing is critical or for your safety. Check
          official MBTA sources and signs in stations.
        </p>
      </Section>

      <Section title="Stay safe">
        <p>
          Don't use NextTrain in a way that puts you or others at risk: stay behind the platform edge, watch where you're
          going, and don't run for a train because of a time shown in the app. In an emergency, call 911 or tell MBTA
          staff.
        </p>
      </Section>

      <Section title="Not affiliated with the MBTA">
        <p>
          NextTrain is independent and isn't affiliated with, endorsed by, or sponsored by the Massachusetts Department
          of Transportation (MassDOT) or the Massachusetts Bay Transportation Authority (MBTA). We use their names only to
          describe the service; "MBTA" and the T logo are trademarks of MassDOT, and NextTrain doesn't use the logo.
          Transit data is provided by MassDOT and the MBTA under MassDOT's{' '}
          <ExternalLink href="https://cdn.mbta.com/sites/default/files/2023-08/mbta-massdot-develop-license-agreement.pdf">developer license agreement</ExternalLink>.
        </p>
      </Section>

      <Section title="Using NextTrain">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>break any law while using NextTrain;</li>
          <li>disrupt, overload, or try to gain unauthorized access to NextTrain or its servers;</li>
          <li>scrape NextTrain or its API, or use automated tools to access them beyond normal personal use;</li>
          <li>copy, resell, or redistribute NextTrain or its data as your own service.</li>
        </ul>
        <p>
          The commutes you save are yours. You're responsible for what you enter, and you can delete it at any time in
          Settings.
        </p>
      </Section>

      <Section title="Other services">
        <p>
          NextTrain uses services from other companies, and their terms apply when you use them through NextTrain: maps by
          Apple (<ExternalLink href="https://www.apple.com/legal/internet-services/maps/terms-en.html">Apple Maps terms</ExternalLink>),
          and, on the website only if you allow it, Google Analytics. If you got the app from Apple's App Store, Apple's{' '}
          <ExternalLink href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
            Licensed Application End User License Agreement
          </ExternalLink>{' '}
          also applies. We're not responsible for other companies' services or websites we link to.
        </p>
      </Section>

      <Section title="Ownership">
        <p>
          NextTrain's name, logo, design, and software belong to {OPERATOR}. Map data belongs to Apple and its data
          providers, and transit data to MassDOT. NextTrain's source code is published on GitHub for transparency;
          publishing it doesn't give anyone a license to reuse it.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          NextTrain is provided "as is" and "as available", without warranties of any kind, express or implied, including
          warranties of accuracy, reliability, availability, merchantability, fitness for a particular purpose, and
          non-infringement. We don't promise that NextTrain will be uninterrupted, error-free, or accurate.
        </p>
      </Section>

      <Section title="Limits on our liability">
        <p>
          To the fullest extent the law allows, {OPERATOR} won't be liable for any indirect, incidental, special,
          consequential, or punitive damages, or for missed trains, lost time, or lost data, arising from your use of
          NextTrain or your reliance on its information. Our total liability for any claim about NextTrain is limited to
          US$50. Some places don't allow these limits, so they may not all apply to you; nothing in these terms limits
          rights you have under laws that can't be waived.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may change NextTrain, or stop offering it, at any time. We may update these terms; the date above shows when
          they last changed, and continuing to use NextTrain after a change means you accept it.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the Commonwealth of {GOVERNING_STATE} and applicable US federal law,
          without regard to conflict-of-law rules. Any dispute will be handled in the state or federal courts located in{' '}
          {GOVERNING_STATE}, unless the law where you live gives you the right to bring it elsewhere. If any part of these
          terms can't be enforced, the rest still applies.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms: <ContactEmail />. How we handle your data is covered in the{' '}
          <InternalLink to="/privacy">Privacy Policy</InternalLink>.
        </p>
      </Section>
    </LegalPage>
  )
}
