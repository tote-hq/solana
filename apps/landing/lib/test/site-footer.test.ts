import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

test('the landing footer keeps nav, social icons, legal note, and the founder line', () => {
  const footer = read('components/landing/site-footer.tsx');
  const css = read('components/landing/landing.module.css');

  assert.match(footer, /<PoweredBy \/>/);
  assert.match(footer, /href="\/reportarbug"/);
  assert.match(footer, /Reportar un bug/);
  assert.match(footer, /\{FOOTER\.legal\}/);
  assert.match(footer, /trust \? <FounderTrust/);
  const footerEl = footer.slice(footer.indexOf('<footer'));
  assert.equal(footerEl.split('FounderTrust').length - 1, 1);
  assert.equal(footer.includes('©'), false);
  assert.match(footer, /aria-label=\{link\.ariaLabel\}/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener noreferrer"/);
  assert.match(footer, /<Icon className=\{styles\.socialIcon\} \/>/);
  assert.match(footer, /SOCIAL_ICONS/);
  assert.equal(footer.includes('XIcon'), true);
  assert.equal(footer.includes('InstagramIcon'), true);
  assert.equal(footer.includes('LinkedInIcon'), true);

  const social = css.slice(css.indexOf('.socialLink {'));
  const socialBody = social.slice(0, social.indexOf('}'));
  assert.match(socialBody, /min-width:\s*44px/);
  assert.match(socialBody, /min-height:\s*44px/);

  const partner = css.slice(css.indexOf('.poweredByLink {'));
  const partnerBody = partner.slice(0, partner.indexOf('}'));
  assert.match(partnerBody, /min-width:\s*44px/);
  assert.match(partnerBody, /min-height:\s*44px/);
});

test('the partner lockup is identifiers, mono marks, and a new-tab name', () => {
  const powered = read('components/landing/powered-by.tsx');
  assert.match(powered, /href: 'https:\/\/academiaqa\.com'/);
  assert.match(powered, /href: 'https:\/\/superteam\.fun\/earn\/regions\/argentina\/'/);
  assert.match(powered, /href: 'https:\/\/blockchainacceleration\.org'/);
  assert.match(powered, /academiaqa-mono\.png/);
  assert.match(powered, /superteam-ar-color\.png/);
  assert.match(powered, /baf-mono\.svg/);
  assert.match(powered, /target="_blank"/);
  assert.match(powered, /rel="noopener noreferrer"/);
  assert.equal(powered.includes('aria-label={`${partner.name} (${NEW_TAB_HINT})`}'), true);
  assert.equal(powered.includes('alt=""'), true);
  assert.match(powered, /partner\.color \? `\$\{styles\.poweredByLogo\} \$\{styles\.poweredByLogoColor\}`/);
  assert.equal(powered.includes('color: true'), true);
  assert.equal((powered.match(/color: false/g) ?? []).length, 2);

  for (const file of [
    'public/brand/partners/academiaqa-mono.png',
    'public/brand/partners/baf-mono.svg',
    'public/brand/partners/superteam-ar-color.png',
  ]) {
    assert.equal(existsSync(join(root, file)), true, file);
  }
});

test('footer text clears WCAG AA on the light plate, including under a dark OS', () => {
  const css = read('components/landing/landing.module.css');
  const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  assert.match(dark, /background:\s*#fafaf7/);
  assert.match(dark, /--ink:\s*#2a1a14/);
  assert.match(dark, /--ink-soft:\s*#5c534c/);
  assert.ok(ratio('#2a1a14', '#fafaf7') >= 4.5);
  assert.ok(ratio('#5c534c', '#fafaf7') >= 4.5);
  assert.ok(ratio('#6B5A52', '#fafaf7') >= 4.5);
});
