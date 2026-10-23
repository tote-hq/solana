import { LANG_STORAGE_KEY, THEME_STORAGE_KEY } from './theme.ts';

/** Runs before paint so a stored theme does not flash the default. */
export const STATS_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var l=localStorage.getItem(${JSON.stringify(LANG_STORAGE_KEY)});var theme=t==='light'?'light':'dark';var lang=l==='es'?'es':'en';var root=document.documentElement;root.setAttribute('data-stats-theme',theme);root.lang=lang;}catch(e){document.documentElement.setAttribute('data-stats-theme','dark');}})();`;
