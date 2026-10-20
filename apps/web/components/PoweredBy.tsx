'use client';

import { newTabHint } from '../lib/founder-trust-copy';
import { useLang } from './LangProvider';

/**
 * The three marks under "Powered by".
 *
 * Grey wordmarks are the mono assets (AcademiaQA, BAF). Superteam Argentina
 * stays in color: it is a badge, and greying it drops the mark. Heights are
 * set in CSS (16px, 18px from 768px). The files are larger so a 2x screen
 * does not soften them.
 *
 * Each control is a link whose name is the organization. The picture is
 * decorative (`alt=""`) so the name is not spoken twice. The new-tab hint
 * matches the founder links and the social icons.
 */
const PARTNERS = [
  {
    id: 'academiaqa',
    name: 'AcademiaQA',
    href: 'https://academiaqa.com',
    src: '/brand/partners/academiaqa-mono.png',
    width: 416,
    height: 96,
    color: false,
  },
  {
    id: 'superteam',
    name: 'Superteam Argentina',
    href: 'https://superteam.fun/earn/regions/argentina/',
    src: '/brand/partners/superteam-ar-color.png',
    width: 96,
    height: 96,
    color: true,
  },
  {
    id: 'baf',
    name: 'BAF Network',
    href: 'https://blockchainacceleration.org',
    src: '/brand/partners/baf-mono.svg',
    width: 85,
    height: 26,
    color: false,
  },
] as const;

export function PoweredBy() {
  const lang = useLang();
  const hint = newTabHint(lang);

  return (
    <div className="powered-by" role="group" aria-label="Powered by" data-testid="powered-by">
      <span className="powered-by-label">Powered by</span>
      <ul className="powered-by-list">
        {PARTNERS.map((partner) => (
          <li key={partner.id}>
            <a
              className="powered-by-link"
              href={partner.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${partner.name} (${hint})`}
              data-testid={`powered-by-${partner.id}`}
            >
              <img
                className={partner.color ? 'powered-by-logo powered-by-logo-color' : 'powered-by-logo'}
                src={partner.src}
                alt=""
                width={partner.width}
                height={partner.height}
                decoding="async"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
