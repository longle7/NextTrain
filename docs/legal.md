# Legal and privacy notes

**Not legal advice.** This records what was checked when the Privacy Policy, Terms of Use, Cookie Policy, and cookie consent were added (September 30, 2026), and how NextTrain meets each item. Have a lawyer review the pages before relying on them.

The pages live in `NextTrain.Web/src/pages/` (`PrivacyPage.tsx`, `TermsPage.tsx`, `CookiesPage.tsx`). Shared facts (operator, contact email, effective date, governing law) are in `NextTrain.Web/src/legal.ts`.

## Before you rely on it

1. **Make `privacy@longledev.com` work** before this ships: the pages promise it. Cloudflare dashboard → longledev.com → **Email** → **Email Routing** → enable → add a custom address `privacy` forwarding to your inbox (free; your real address stays private).
2. **Google Analytics** (only if you want it): create a GA4 property for `nexttrain.longledev.com`. In Admin, keep **Data retention** at **2 months** (the Privacy Policy says so), leave **Google signals** off, and don't link Google Ads. Then add the repository variable `GA_MEASUREMENT_ID` (e.g. `G-ABC123`). Until then there's no analytics and no cookie notice.
3. **Confirm the governing law** (Massachusetts is the default, in `legal.ts`).
4. **Choose a license for the code**, if you want others to reuse it. There's no `LICENSE` file, so it's all rights reserved, which is what the Terms say.
5. **Keep the pages true.** When the app starts collecting something new, update the Privacy Policy and Cookie Policy, bump `EFFECTIVE_DATE`, and, for significant changes, tell people in the app (the policy promises this).

## Laws checked

| Law | Applies? | How NextTrain meets it |
|---|---|---|
| **CalOPPA** (California Online Privacy Protection Act) | Yes: any site collecting personal info from Californians | A privacy policy linked from Settings, the cookie notice, and every legal page. It lists what's collected, who it's shared with, how Do Not Track is handled (honored: analytics stays off), the effective date, and how changes are announced. |
| **CCPA/CPRA** (California) | Probably not yet: it applies from $25M+ revenue, or 100,000+ Californians' data, or earning mostly from selling or sharing data | The policy follows it anyway: no selling or sharing, rights to know, delete, and correct, no discrimination, and Global Privacy Control honored. |
| Other US state privacy laws (Virginia, Colorado, Connecticut, Texas, and others) | Probably not yet: most start at 100,000 residents | Nothing is sold and there's no targeted advertising, and the universal opt-out (GPC) is honored. |
| **Massachusetts** | No comprehensive consumer privacy law in force as far as I know (check for new legislation). 201 CMR 17.00 and ch. 93H cover names with SSNs or financial account numbers, which NextTrain never collects | Collect little; keys and passwords are encrypted secrets; don't mislead (ch. 93A), which is why the pages must stay accurate. |
| **COPPA** (children under 13) | Only if the app is aimed at children or knowingly collects their data | Not aimed at children; the policy says so and offers deletion. |
| **FTC Act §5** (deceptive practices) | Yes | Every claim in the pages is tested against the app (see the PR). |
| **GDPR / UK GDPR and ePrivacy** (EU/UK visitors) | Possibly, for visitors from there | No non-essential cookie before consent; Reject is as easy as Allow; consent can be withdrawn in Settings, which also deletes the cookies; legal bases, rights, and the right to complain are listed; US storage is disclosed. |
| **ADA / accessibility** | Websites increasingly held to WCAG 2.1 AA | WCAG 2.2 AA, audited with axe (see the accessibility PR). |

## Third-party terms

| Terms | Requirement | Status |
|---|---|---|
| [MassDOT developer license](https://cdn.mbta.com/sites/default/files/2023-08/mbta-massdot-develop-license-agreement.pdf) (MBTA data) | Clearly acknowledge MassDOT as the data provider; no MassDOT/MBTA logos; don't claim ownership of the data; no guarantees about it | Settings credits MassDOT; own logo; the Terms state MassDOT's ownership and disclaim warranties. |
| Apple MapKit JS | Keep Apple's logo and Legal link on the map | Shown by MapKit itself; not hidden. |
| Google Analytics terms | Disclose GA use, get consent where required, send no personal information | The Privacy and Cookie Policies disclose it and link Google's page; consent first; no user ID; paths cleaned of IDs and queries. |
| App Store Review Guidelines 5.1.1 | A privacy policy link in the app and in App Store Connect; a way to delete data | Settings → Privacy Policy; https://nexttrain.longledev.com/privacy; Settings → Delete my data. The app has no analytics, so the App Privacy answers in `docs/app-store/README.md` are unchanged. |
