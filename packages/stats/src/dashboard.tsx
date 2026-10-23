'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { type Lang } from './i18n.ts';
import { buildStatsView, type ChartModel, type Grain, type NetworkFilter, type StatsView } from './metrics.ts';
import { LANG_STORAGE_KEY, SOLANA_COLOR, STATS_CSS, STELLAR_COLOR, THEME_STORAGE_KEY } from './theme.ts';

type ThemeName = 'dark' | 'light';

function readStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

function applyDocument(theme: ThemeName, lang: Lang) {
  const root = document.documentElement;
  root.setAttribute('data-stats-theme', theme);
  root.lang = lang === 'es' ? 'es' : 'en';
}

function moveRadio<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  options: { id: T }[],
  current: T,
  select: (id: T) => void,
  focus: (id: T) => void,
) {
  const index = options.findIndex((option) => option.id === current);
  if (index < 0) return;
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
  else return;
  event.preventDefault();
  const id = options[next]!.id;
  select(id);
  focus(id);
}

function Bars({ chart }: { chart: ChartModel }) {
  const width = 640;
  const height = 248;
  const pad = { l: 40, r: 8, t: 12, b: 32 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const slot = plotW / Math.max(1, chart.points.length);
  const barW = Math.min(28, slot * 0.62);
  return (
    <svg role="img" aria-label={chart.summary} viewBox={`0 0 ${width} ${height}`}>
      {chart.ticks.map((tick) => {
        const y = pad.t + plotH - (tick / chart.max) * plotH;
        return (
          <g key={tick}>
            <line className="chg-stats-grid" x1={pad.l} x2={width - pad.r} y1={y} y2={y} />
            <text className="chg-stats-axis" x={pad.l - 8} y={y + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        );
      })}
      {chart.points.map((point, index) => {
        const cx = pad.l + slot * index + slot / 2;
        const x = cx - barW / 2;
        const solanaH = (point.solana / chart.max) * plotH;
        const stellarH = (point.stellar / chart.max) * plotH;
        const base = pad.t + plotH;
        return (
          <g key={point.label}>
            <title>{point.tooltip}</title>
            {point.solana > 0 ? (
              <rect x={x} y={base - solanaH} width={barW} height={solanaH} rx={4} fill={SOLANA_COLOR}>
                <title>{point.tooltip}</title>
              </rect>
            ) : null}
            {point.stellar > 0 ? (
              <rect
                x={x}
                y={base - solanaH - stellarH}
                width={barW}
                height={stellarH}
                rx={4}
                fill={STELLAR_COLOR}
              >
                <title>{point.tooltip}</title>
              </rect>
            ) : null}
            <text className="chg-stats-axis" x={cx} y={height - 10} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RadioRow<T extends string>({
  label,
  options,
  value,
  onChange,
  name,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  name: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div role="radiogroup" aria-label={label} className="chg-stats-seg" data-testid={`stats-${name}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          name={name}
          aria-checked={value === option.id}
          tabIndex={value === option.id ? 0 : -1}
          ref={(node) => {
            refs.current[option.id] = node;
          }}
          onClick={() => onChange(option.id)}
          onKeyDown={(event) =>
            moveRadio(event, options, value, onChange, (id) => refs.current[id]?.focus())
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ThemeIcon({ theme }: { theme: ThemeName }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.5 3.5a8.5 8.5 0 1 0 5 12.2A7 7 0 0 1 15.5 3.5z"
      />
    </svg>
  );
}

function ChartCard({ chart }: { chart: ChartModel }) {
  const titleId = useId();
  return (
    <article className="chg-stats-card" aria-labelledby={titleId} data-testid={`stats-chart-${chart.id}`}>
      <h3 id={titleId} className="chg-stats-chart-title">
        {chart.title}
      </h3>
      <p className="chg-stats-chart-value">{chart.total}</p>
      <ul className="chg-stats-legend">
        {chart.legend.map((item) => (
          <li key={item.id}>
            <span className="chg-stats-dot" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      <Bars chart={chart} />
      <table className="chg-stats-sr">
        <caption>{chart.summary}</caption>
        <tbody>
          {chart.points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.tooltip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

export function StatsDashboard() {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [lang, setLang] = useState<Lang>('en');
  const [network, setNetwork] = useState<NetworkFilter>('all');
  const [grain, setGrain] = useState<Grain>('day');
  const [cumulative, setCumulative] = useState(false);

  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      const storedTheme = readStoredTheme();
      const storedLang = readStoredLang();
      setTheme(storedTheme);
      setLang(storedLang);
      applyDocument(storedTheme, storedLang);
      return;
    }
    applyDocument(theme, lang);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* private mode still shows the chosen theme for this view */
    }
  }, [theme, lang]);

  const view: StatsView = buildStatsView(lang, network, grain, cumulative);
  const grains: { id: Grain; label: string }[] = [
    { id: 'month', label: view.month },
    { id: 'day', label: view.day },
  ];

  return (
    <div className="chg-stats" lang={view.htmlLang} data-testid="stats-dashboard">
      <style>{STATS_CSS}</style>
      <a className="chg-stats-skip" href="#chg-stats-main">
        {view.skip}
      </a>
      <header className="chg-stats-header" data-testid="stats-header">
        <a className="chg-stats-brand" href={view.backHref}>
          <img src="/brand/mascot-idle.png" alt="" width={36} height={36} />
          <span className="chg-stats-word">{view.brand}</span>
          <span className="chg-stats-pill">{view.badge}</span>
        </a>
        <div className="chg-stats-controls">
          <a className="chg-stats-back" href={view.backHref}>
            {view.back}
          </a>
          <RadioRow
            name="network"
            label={view.networkLabel}
            options={view.networks}
            value={network}
            onChange={setNetwork}
          />
          <RadioRow
            name="lang"
            label={view.langLabel}
            options={view.langs}
            value={lang}
            onChange={setLang}
          />
          <button
            type="button"
            className="chg-stats-icon"
            data-testid="stats-theme"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? view.themeToLight : view.themeToDark}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>
      <main id="chg-stats-main" className="chg-stats-main">
        <header className="chg-stats-hero">
          <h1>{view.heroTitle}</h1>
          <p className="chg-stats-lead">{view.heroLead}</p>
        </header>
        <section className="chg-stats-kpis" data-testid="stats-kpis">
          {view.kpis.map((card) => (
            <article key={card.id} className="chg-stats-card" data-testid={`stats-kpi-${card.id}`}>
              <p className="chg-stats-kicker">{card.label}</p>
              <p className="chg-stats-value">{card.value}</p>
              <p className="chg-stats-detail">{card.detail}</p>
            </article>
          ))}
        </section>
        <section className="chg-stats-section" aria-labelledby="chg-stats-growth">
          <div className="chg-stats-head">
            <h2 id="chg-stats-growth">{view.growthTitle}</h2>
            <div className="chg-stats-controls">
              <RadioRow
                name="grain"
                label={view.grainLabel}
                options={grains}
                value={grain}
                onChange={setGrain}
              />
              <div className="chg-stats-seg">
                <button
                  type="button"
                  aria-pressed={cumulative}
                  data-testid="stats-cumulative"
                  onClick={() => setCumulative((value) => !value)}
                >
                  {view.cumulative}
                </button>
              </div>
            </div>
          </div>
          <div className="chg-stats-charts">
            {view.charts.map((chart) => (
              <ChartCard key={chart.id} chart={chart} />
            ))}
          </div>
        </section>
        <section className="chg-stats-section" aria-labelledby="chg-stats-split">
          <div className="chg-stats-head">
            <h2 id="chg-stats-split">{view.splitTitle}</h2>
          </div>
          <div className="chg-stats-split">
            <article className="chg-stats-card" data-testid="stats-by-network">
              <h3>{view.networkCardTitle}</h3>
              {view.networkRows.map((row) => (
                <div key={row.id} className="chg-stats-bar">
                  <p>
                    <b>{row.label}</b>
                    <em>{row.detail}</em>
                  </p>
                  <div className="chg-stats-track" aria-hidden="true">
                    <div className="chg-stats-fill" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                </div>
              ))}
            </article>
            <article className="chg-stats-card" data-testid="stats-engineering">
              <h3>{view.engineeringTitle}</h3>
              <div className="chg-stats-mini">
                {view.engineeringStats.map((stat) => (
                  <div key={stat.id}>
                    <strong>{stat.value}</strong>
                    <span>
                      {stat.label}
                      <br />
                      {stat.scope}
                    </span>
                  </div>
                ))}
              </div>
              {view.engineeringRows.map((row) => (
                <div key={row.id} className="chg-stats-bar">
                  <p>
                    <b>{row.label}</b>
                    <em>{row.detail}</em>
                  </p>
                  <div className="chg-stats-track" aria-hidden="true">
                    <div className="chg-stats-fill" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                </div>
              ))}
            </article>
          </div>
        </section>
        <section className="chg-stats-section" aria-labelledby="chg-stats-recent">
          <div className="chg-stats-head">
            <h2 id="chg-stats-recent">{view.recentTitle}</h2>
          </div>
          <div className="chg-stats-table-wrap">
            <table data-testid="stats-transactions">
              <thead>
                <tr>
                  <th scope="col">{view.columns.when}</th>
                  <th scope="col">{view.columns.network}</th>
                  <th scope="col">{view.columns.type}</th>
                  <th scope="col">{view.columns.tx}</th>
                  <th scope="col">{view.columns.program}</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{view.empty}</td>
                  </tr>
                ) : (
                  view.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.when}</td>
                      <td>{row.network}</td>
                      <td>{row.type}</td>
                      <td>
                        <a href={row.txHref} target="_blank" rel="noopener noreferrer" aria-label={row.txAria}>
                          {row.txLabel}
                        </a>
                      </td>
                      <td>
                        <a
                          href={row.programHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={row.programAria}
                        >
                          {row.programLabel}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
