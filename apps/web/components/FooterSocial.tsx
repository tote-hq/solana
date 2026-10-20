'use client';

import { newTabHint } from '../lib/founder-trust-copy';
import { socialLinks } from '../lib/social';
import { InstagramIcon, LinkedInIcon, XIcon } from './icons';
import { useLang } from './LangProvider';

const ICONS = {
  instagram: InstagramIcon,
  x: XIcon,
} as const;

/** Company page. Not one of `SOCIAL`: that list is the two accounts the landing compares verbatim. */
const LINKEDIN = {
  href: 'https://www.linkedin.com/company/appchanguito/',
  ariaLabel: 'LinkedIn de Changuito',
  ariaLabelEn: 'Changuito on LinkedIn',
} as const;

/**
 * Icon links for the public profiles. They sit beside the trust line, not
 * inside it, so the founder sentence stays one reading and the LinkedIn
 * names stay the only text links in that sentence.
 *
 * The accessible name starts with the same label the landing uses. The
 * new-tab hint is the same phrase the founder links append.
 *
 * Both halves of that name follow the language, which is why this is a client
 * component now. Nothing visible changes: the control is the glyph, and a
 * camera is a camera in either language.
 */
export function FooterSocial() {
  const lang = useLang();
  const hint = newTabHint(lang);
  return (
    <nav
      className="app-social"
      aria-label={lang === 'en' ? 'Changuito social profiles' : 'Redes de Changuito'}
      data-testid="app-social"
    >
      <ul className="app-social-list">
        {socialLinks(lang).map((link) => {
          const Icon = ICONS[link.id];
          return (
            <li key={link.id}>
              <a
                className="app-social-link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.ariaLabel} (${hint})`}
                data-testid={`app-social-${link.id}`}
              >
                <Icon />
              </a>
            </li>
          );
        })}
        <li>
          <a
            className="app-social-link"
            href={LINKEDIN.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${lang === 'en' ? LINKEDIN.ariaLabelEn : LINKEDIN.ariaLabel} (${hint})`}
            data-testid="app-social-linkedin"
          >
            <LinkedInIcon />
          </a>
        </li>
      </ul>
    </nav>
  );
}
