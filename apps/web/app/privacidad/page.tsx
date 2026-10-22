import type { Metadata } from 'next';

import { LangToggle } from '../../components/LangToggle';
import { LangProvider } from '../../components/LangProvider';
import { ScrollPage } from '../../components/ScrollPage';
import { inLang } from '../../lib/lang.ts';
import { langFromCookie } from '../../lib/lang-server.ts';
import { privacyCopy } from '../../lib/privacy-copy.ts';
import { SOCIAL } from '../../lib/social.ts';

export const dynamic = 'force-dynamic';

const BUG = 'https://www.changuito.me/reportarbug';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await langFromCookie();
  return {
    title: inLang(lang, { es: 'Privacidad', en: 'Privacy' }),
    description: inLang(lang, {
      es: 'Qué datos guarda esta aplicación y qué no puede borrar.',
      en: 'What this app stores, and what it cannot delete.',
    }),
  };
}

export default async function PrivacyPage() {
  const lang = await langFromCookie();
  const copy = privacyCopy(lang);
  return (
    <LangProvider initial={lang}>
      <ScrollPage>
        <p className="legal-back">
          <a href="/">{copy.back}</a>
        </p>
        <h1>{copy.title}</h1>
        <p className="legal-intro">{copy.intro}</p>
        {copy.sections.map((section) => (
          <section key={section.id} aria-labelledby={`privacy-${section.id}`}>
            <h2 id={`privacy-${section.id}`}>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <section className="legal-gaps" aria-labelledby="privacy-gaps">
          <h2 id="privacy-gaps">{copy.gapsHeading}</h2>
          <p>{copy.gapsLead}</p>
          <ul>
            {copy.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact">{copy.contactHeading}</h2>
          <p>{copy.contactLead}</p>
          <ul className="legal-contact">
            <li>
              <a href={BUG} target="_blank" rel="noopener noreferrer">
                {BUG}
              </a>
            </li>
            {SOCIAL.map((link) => (
              <li key={link.id}>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.ariaLabel}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <footer className="legal-footer">
          <LangToggle />
        </footer>
      </ScrollPage>
    </LangProvider>
  );
}
