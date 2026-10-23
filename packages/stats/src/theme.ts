/**
 * Dashboard colours. Dark is the default. Text pairs are checked against
 * WCAG 2.2 AA (4.5:1) in the stats tests.
 */

export const SOLANA_COLOR = '#8b5cf6';
export const STELLAR_COLOR = '#3b82f6';
export const TYPE_COLOR = '#6366f1';

export const THEME = {
  dark: {
    bg: '#0f172a',
    surface: '#1e293b',
    border: '#334155',
    text: '#f8fafc',
    muted: '#cbd5e1',
    accent: '#93c5fd',
    accentInk: '#0f172a',
    track: '#334155',
    focus: '#93c5fd',
  },
  light: {
    bg: '#ffffff',
    surface: '#f8fafc',
    border: '#e5e7eb',
    text: '#0f172a',
    muted: '#475569',
    accent: '#1d4ed8',
    accentInk: '#ffffff',
    track: '#e5e7eb',
    focus: '#1d4ed8',
  },
} as const;

export const THEME_STORAGE_KEY = 'changuito-stats-theme';
export const LANG_STORAGE_KEY = 'changuito-stats-lang';

/** Text on its background. Each pair must clear 4.5:1. */
export const TEXT_PAIRS = {
  dark: [
    [THEME.dark.text, THEME.dark.bg],
    [THEME.dark.text, THEME.dark.surface],
    [THEME.dark.muted, THEME.dark.bg],
    [THEME.dark.muted, THEME.dark.surface],
    [THEME.dark.accent, THEME.dark.bg],
    [THEME.dark.accent, THEME.dark.surface],
    [THEME.dark.accentInk, THEME.dark.accent],
  ],
  light: [
    [THEME.light.text, THEME.light.bg],
    [THEME.light.text, THEME.light.surface],
    [THEME.light.muted, THEME.light.bg],
    [THEME.light.muted, THEME.light.surface],
    [THEME.light.accent, THEME.light.bg],
    [THEME.light.accent, THEME.light.surface],
    [THEME.light.accentInk, THEME.light.accent],
  ],
} as const;

function vars(theme: (typeof THEME)['dark' | 'light']): string {
  return [
    `--stats-bg:${theme.bg}`,
    `--stats-surface:${theme.surface}`,
    `--stats-border:${theme.border}`,
    `--stats-text:${theme.text}`,
    `--stats-muted:${theme.muted}`,
    `--stats-accent:${theme.accent}`,
    `--stats-accent-ink:${theme.accentInk}`,
    `--stats-track:${theme.track}`,
    `--stats-focus:${theme.focus}`,
  ].join(';');
}

export const STATS_CSS = `
:root{${vars(THEME.dark)};color-scheme:dark}
html[data-stats-theme='dark']{${vars(THEME.dark)};color-scheme:dark}
html[data-stats-theme='light']{${vars(THEME.light)};color-scheme:light}
html:has(.chg-stats),html:has(.chg-stats) body{height:auto;overflow:auto;background:var(--stats-bg);color:var(--stats-text)}
.chg-stats{min-height:100dvh;background:var(--stats-bg);color:var(--stats-text);font-family:var(--font-inter),Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.chg-stats *{box-sizing:border-box}
.chg-stats a{color:var(--stats-accent);text-decoration-thickness:1px;text-underline-offset:3px}
.chg-stats a:hover{text-decoration-thickness:2px}
.chg-stats :focus{outline:none}
.chg-stats :focus-visible{outline:3px solid var(--stats-focus);outline-offset:2px}
.chg-stats-skip{position:absolute;left:12px;top:-40px;z-index:40;background:var(--stats-accent);color:var(--stats-accent-ink);padding:8px 12px;border-radius:8px;font-weight:700}
.chg-stats-skip:focus{top:12px}
.chg-stats-header{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:10px 20px;border-bottom:1px solid var(--stats-border);background:color-mix(in srgb,var(--stats-bg) 88%,transparent);backdrop-filter:blur(14px)}
.chg-stats-brand{display:flex;align-items:center;gap:10px;min-height:44px;color:inherit;text-decoration:none}
.chg-stats-brand img{width:36px;height:36px;object-fit:contain}
.chg-stats-word{font-weight:700;font-size:18px;letter-spacing:-0.02em}
.chg-stats-pill{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:4px 8px;border-radius:999px;border:1px solid var(--stats-border);color:var(--stats-muted)}
.chg-stats-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.chg-stats-back{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;font-size:14px;font-weight:600}
.chg-stats-seg{display:inline-flex;align-items:center;min-height:44px;padding:0;border:1px solid var(--stats-border);border-radius:999px;background:var(--stats-surface)}
.chg-stats-seg button{appearance:none;border:0;background:transparent;color:var(--stats-text);font:inherit;font-size:13px;font-weight:600;min-height:44px;min-width:44px;padding:0 12px;border-radius:999px;cursor:pointer}
.chg-stats-seg button[aria-checked='true']{background:var(--stats-accent);color:var(--stats-accent-ink)}
.chg-stats-icon{appearance:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--stats-border);background:var(--stats-surface);color:var(--stats-text);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.chg-stats-icon svg{width:18px;height:18px;display:block}
.chg-stats-main{max-width:1120px;margin:0 auto;padding:8px 20px 72px}
.chg-stats-hero{margin:28px 0 22px}
.chg-stats h1{margin:0 0 8px;font-size:clamp(32px,4vw,44px);line-height:1.1;letter-spacing:-0.03em;font-weight:700}
.chg-stats-lead{margin:0;max-width:38rem;color:var(--stats-muted);font-size:16px;line-height:1.45}
.chg-stats-kpis{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.chg-stats-card{background:var(--stats-surface);border:1px solid var(--stats-border);border-radius:18px;padding:18px 18px 16px}
.chg-stats-kicker{margin:0;color:var(--stats-muted);font-size:13px;font-weight:600}
.chg-stats-value{margin:8px 0 6px;color:var(--stats-accent);font-size:36px;line-height:1.05;font-weight:700;letter-spacing:-0.03em}
.chg-stats-detail{margin:0;color:var(--stats-muted);font-size:13px;line-height:1.45}
.chg-stats-section{margin-top:28px}
.chg-stats-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}
.chg-stats-section h2{margin:0;font-size:13px;letter-spacing:0.08em;font-weight:700;text-transform:uppercase;color:var(--stats-muted)}
.chg-stats-charts{display:grid;gap:16px}
.chg-stats-chart-title{margin:0;font-size:15px;font-weight:700}
.chg-stats-chart-value{margin:6px 0 10px;font-size:32px;font-weight:700;letter-spacing:-0.03em}
.chg-stats-legend{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 8px;padding:0;list-style:none;color:var(--stats-muted);font-size:13px}
.chg-stats-legend li{display:flex;align-items:center;gap:6px}
.chg-stats-dot{width:8px;height:8px;border-radius:50%;flex:none}
.chg-stats-chart svg{width:100%;height:auto;display:block;overflow:visible}
.chg-stats-axis{fill:var(--stats-muted);font-size:12px}
.chg-stats-grid{stroke:var(--stats-border);stroke-dasharray:3 4}
.chg-stats-split{display:grid;gap:16px}
.chg-stats-card h3{margin:0 0 14px;font-size:15px;font-weight:700}
.chg-stats-mini{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.chg-stats-mini div{border:1px solid var(--stats-border);border-radius:14px;padding:12px}
.chg-stats-mini strong{display:block;font-size:26px;letter-spacing:-0.03em;color:var(--stats-accent)}
.chg-stats-mini span{display:block;margin-top:4px;color:var(--stats-muted);font-size:12px;line-height:1.35}
.chg-stats-bar{margin:0 0 12px}
.chg-stats-bar p{display:flex;justify-content:space-between;gap:12px;margin:0 0 6px;font-size:13px}
.chg-stats-bar b{font-weight:600}
.chg-stats-bar em{font-style:normal;color:var(--stats-muted);text-align:right}
.chg-stats-track{height:8px;border-radius:999px;background:var(--stats-track);overflow:hidden}
.chg-stats-fill{height:100%;border-radius:999px}
.chg-stats-table-wrap{overflow-x:auto;border:1px solid var(--stats-border);border-radius:18px;background:var(--stats-surface)}
.chg-stats table{width:100%;border-collapse:collapse;font-size:14px}
.chg-stats th{text-align:left;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--stats-muted);font-weight:700;padding:12px 14px;border-bottom:1px solid var(--stats-border)}
.chg-stats td{padding:12px 14px;border-bottom:1px solid var(--stats-border);vertical-align:middle}
.chg-stats tr:last-child td{border-bottom:0}
.chg-stats-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (min-width:900px){
  .chg-stats-charts,.chg-stats-split{grid-template-columns:1fr 1fr}
}
@media (min-width:1024px){
  .chg-stats-kpis{grid-template-columns:repeat(4,1fr)}
}
@media (max-width:699px){
  .chg-stats-header{padding:10px 14px}
  .chg-stats-main{padding:4px 14px 56px}
  .chg-stats-value{font-size:30px}
  .chg-stats-seg button{padding:0 10px}
}
@media (prefers-reduced-motion:reduce){
  .chg-stats *{transition:none !important;scroll-behavior:auto !important}
}
`.trim();
