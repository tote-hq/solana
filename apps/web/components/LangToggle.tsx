'use client';

import { useRouter } from 'next/navigation';

import { LANG_SWITCH } from '../lib/lang.ts';
import { GlobeIcon } from './icons';
import { useLang, useSetLang } from './LangProvider';

/**
 * The way out of a language you do not read.
 *
 * It sits in the footer, next to the copyright and the privacy link,
 * rather than the masthead on purpose: the masthead is already two controls
 * wide at 360px next to a wordmark that shrinks, and a language switch is a
 * thing you look for once and then never again. The footer is where the
 * "about this site" furniture lives, which is what this is.
 *
 * ## The label is the destination, in the destination's language
 *
 * A toggle reading "ES" is ambiguous in the way that matters — is that the
 * language I am in, or the one I would get? The accessible name still says
 * **English** when the page is Spanish, and **Español** when it is English,
 * always in the language it takes you to. The visible face is the short code
 * (EN / ES) because the footer lockup is a 32px pill beside 16px glyphs; the
 * code is the first token of the accessible name, so the visible text is in
 * the name.
 *
 * `lang` on the element tells a screen reader to switch voice for that word,
 * so "Español" inside an English page is not read as English.
 *
 * ## Two things have to move, and only one of them is React state
 *
 * Almost every word on screen comes from a client component reading the copy
 * modules off this context, so setting the state re-renders the page in the
 * other language in one commit, with no round trip. The cookie write is for the
 * *next* request, so a reload or a second tab agrees with the toggle rather
 * than snapping back.
 *
 * But the tagline and the document metadata are rendered on the *server*, from
 * the cookie, and client state cannot reach them. `router.refresh()` re-runs
 * the server render against the cookie just written and merges the payload
 * without losing client state, which is why the order here is cookie first,
 * then refresh. It is a round trip the visible copy does not wait for.
 */
export function LangToggle() {
  const lang = useLang();
  const setLang = useSetLang();
  const router = useRouter();
  const next = LANG_SWITCH[lang];
  const short = next.to === 'en' ? 'EN' : 'ES';

  const flip = () => {
    setLang(next.to);
    router.refresh();
  };

  return (
    <button
      type="button"
      className="app-lang"
      lang={next.to}
      aria-label={`${short}. ${next.aria}`}
      data-testid="app-lang"
      onClick={flip}
    >
      <span className="app-lang-face">
        <GlobeIcon />
        <span className="app-lang-label">{short}</span>
      </span>
    </button>
  );
}
