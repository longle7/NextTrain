import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CONTACT_EMAIL, EFFECTIVE_DATE } from '../legal'
import { useTitle } from '../usePolling'

const linkStyle = 'text-blue-700 underline dark:text-blue-300'

/** The shared frame for the Privacy Policy, Terms of Use, and Cookie Policy: title, date, and links between them. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useTitle(title)
  return (
    <article className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-neutral-500">Effective {EFFECTIVE_DATE}</p>
      </div>
      {children}
      <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
        <Link to="/privacy" className={linkStyle}>Privacy Policy</Link>
        <Link to="/terms" className={linkStyle}>Terms of Use</Link>
        <Link to="/cookies" className={linkStyle}>Cookie Policy</Link>
      </nav>
    </article>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-neutral-700 dark:text-neutral-300">{children}</div>
    </section>
  )
}

/** A link to another site, which opens in a new tab and says so to screen readers. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkStyle}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function ContactEmail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={linkStyle}>
      {CONTACT_EMAIL}
    </a>
  )
}

export function InternalLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkStyle}>
      {children}
    </Link>
  )
}
