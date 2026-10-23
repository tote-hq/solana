import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { COPYRIGHT_LINE, FOUNDERS, TRUST_LINE } from '../founder-trust-copy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('the shopper footer prints the copyright line and not the founder sentence', () => {
  assert.equal(COPYRIGHT_LINE, '© 2026 Changuito\u00AE');
  assert.equal(TRUST_LINE, '© 2026 Changuito\u00AE · Hecho en 🇦🇷 por SimonethG y Fabio.');
  assert.equal(TRUST_LINE.includes('\u2014'), false);
  assert.equal(TRUST_LINE.includes('\u2013'), false);
  assert.equal(TRUST_LINE.includes('(R)'), false);
  assert.equal(TRUST_LINE.includes('app.changuito.me'), false);
  assert.deepEqual(
    FOUNDERS.map((person) => ({ name: person.name, href: person.href })),
    [
      { name: 'SimonethG', href: 'https://www.linkedin.com/in/simonethg/' },
      { name: 'Fabio', href: 'https://www.linkedin.com/in/fabio-laura-yavi/' },
    ],
  );

  const page = readFileSync(join(root, 'app/page.tsx'), 'utf8');
  const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
  const footerStart = page.indexOf('<footer className="app-footer"');
  const footerEnd = page.indexOf('</footer>', footerStart);
  const footer = page.slice(footerStart, footerEnd);

  assert.equal(existsSync(join(root, 'components/FounderTrust.tsx')), false);
  assert.equal(page.includes('FounderTrust'), false);
  assert.equal(page.includes('PoweredBy'), false);
  assert.equal(page.includes('FooterSocial'), false);
  assert.equal(footer.includes('Hecho en'), false);
  assert.equal(footer.includes('SimonethG'), false);
  assert.match(footer, /\{COPYRIGHT_LINE\}/);
  assert.match(footer, /<a className="app-legal" href="\/privacidad">/);
  assert.match(footer, /inLang\(lang, \{ es: 'Privacidad', en: 'Privacy' \}\)/);
  assert.match(footer, /<LangToggle \/>/);
  assert.equal(page.includes('app.changuito.me'), false);
  assert.match(css, /\.app-footer\s*\{/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.equal(css.includes('column-reverse'), false);
  assert.equal(css.includes('.powered-by'), false);
  const footerRule = css.slice(css.indexOf('.app-footer {'), css.indexOf('.app-footer-copy'));
  assert.equal(footerRule.includes('position: fixed'), false);
});
