/**
 * Read-only catalog probe. Same 10 queries on Coto (anonymous Constructor
 * search) and Jumbo (the existing VTEX adapter). Creates nothing: no login,
 * no delivery address, no cart, no checkout.
 *
 *   node dist/probe-chains.js
 *
 * The Constructor index key is the public browser key the storefront bundle
 * already ships. It is read from that bundle at runtime and never written to
 * the probe output. It is not an account credential.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAdapter } from './adapters/registry.js';
import type { Product } from './types.js';

const QUERIES = [
  'leche entera',
  'arroz largo fino',
  'fideos spaghetti',
  'aceite de girasol',
  'azucar',
  'yerba mate',
  'harina 0000',
  'huevos',
  'pan lactal',
  'papel higienico',
] as const;

const JUMBO_POSTAL = '1425';
const TZ = 'America/Argentina/Buenos_Aires';
/** Gap between outbound calls. One request at a time. */
const GAP_MS = 400;
const TIMEOUT_MS = 25_000;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Branch id the public storefront uses when no address is saved
 * (`getIdSucursal() || "200"`). It is not sent on the search request.
 * The response already carries a price row per branch; we read this one.
 */
const ANONYMOUS_STORE = '200';

const COTO_ENDPOINT =
  'GET https://ac.cnstrc.com/search/{query}?key=<public browser key>&section=Products&num_results_per_page=1';

/**
 * Pack net content, as written in the product name.
 * Coto's `product_format_quantity` + `product_format` is the unit `formatPrice`
 * is quoted per (1 Kilo on a 500 g pack, 1 Litro on a 1.5 L bottle). Jumbo's
 * `unitMultiplier` + `measurementUnit` is the selling unit (`1 un`). Neither
 * is the pack's net content, and neither response has a field that carries it.
 */
const NET_UNIT =
  'kilogramos?|kgm|kgs?|gramos?|grs?|gr|g|mililitros?|mls?|ml|litros?|lts?|lt|l|metros?|mts?|mt|m|rollos?|unidades?|un|u|cc';
const NET_CONTENT_RE = new RegExp(
  `\\b(?:\\d+(?:[.,]\\d+)?\\s*[x×]\\s*\\d+(?:[.,]\\d+)?\\s*(?:${NET_UNIT})|\\d+(?:[.,]\\d+)?\\s*(?:${NET_UNIT}))(?![a-z])`,
  'gi',
);

interface ProbeRow {
  query: string;
  name: string;
  shelf: string;
  shelfValue: number | null;
  list: string;
  ean: string;
  brand: string;
  size: string;
  available: string;
  notes: string;
  hasEan: boolean;
  hasBrand: boolean;
  hasSize: boolean;
}

interface CotoPriceRow {
  store?: string;
  listPrice?: number;
  formatPrice?: number;
}

interface CotoHit {
  value?: string;
  data?: {
    price?: CotoPriceRow[];
    sku_display_name?: string;
    sku_description?: string;
    product_list_price?: number | string;
    product_main_ean?: string | number;
    product_brand?: string;
    /** Unit `formatPrice` is quoted per. Not the pack's net content. */
    product_format?: string;
    product_format_quantity?: number;
    store_availability?: unknown;
    discounts?: Array<{ discountText?: string }>;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function part(now: Date, type: Intl.DateTimeFormatPartTypes): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return parts.find((p) => p.type === type)?.value ?? '';
}

function ranAt(now = new Date()): { day: string; when: string } {
  const day = `${part(now, 'year')}-${part(now, 'month')}-${part(now, 'day')}`;
  const time = `${part(now, 'hour')}:${part(now, 'minute')}:${part(now, 'second')}`;
  return { day, when: `${day} ${time} ART` };
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
}

function plainNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

/** A finite number, or a plain numeric string. Currency text is left unparsed. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function sizeFromName(name: string): string | null {
  const found = name.match(NET_CONTENT_RE);
  if (!found?.length) return null;
  return found.map((part) => part.replace(/\s+/g, ' ').trim()).join(' ');
}

function blankRow(query: string, notes: string): ProbeRow {
  return {
    query,
    name: '—',
    shelf: '—',
    shelfValue: null,
    list: '—',
    ean: '—',
    brand: '—',
    size: '—',
    available: '—',
    notes,
    hasEan: false,
    hasBrand: false,
    hasSize: false,
  };
}

function publicFailure(e: unknown): string {
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'timeout';
  return 'request failed';
}

async function getText(url: string, accept: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    headers: { Accept: accept, 'Accept-Language': 'es-AR,es;q=0.9', 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, text: await res.text() };
}

/**
 * The public index key from the storefront's own bundle
 * (`constructor.apiKey` on www.coto.com.ar). No cookies, no session.
 */
async function discoverPublicKey(): Promise<string> {
  const home = await getText('https://www.coto.com.ar/', 'text/html');
  if (home.status !== 200) throw new Error(`storefront HTTP ${home.status}`);
  const main = home.text.match(/src="(\/main\.[a-f0-9]+\.js)"/);
  if (!main?.[1]) throw new Error('storefront HTML had no main bundle');
  await sleep(GAP_MS);
  const bundle = await getText(`https://www.coto.com.ar${main[1]}`, '*/*');
  if (bundle.status !== 200) throw new Error(`storefront bundle HTTP ${bundle.status}`);
  const key = bundle.text.match(/constructor:\{apiKey:"(key_[A-Za-z0-9]+)"/);
  if (!key?.[1]) throw new Error('storefront bundle had no public Constructor key');
  return key[1];
}

function cotoRow(query: string, hit: CotoHit | undefined): ProbeRow {
  if (!hit) return blankRow(query, 'no results');
  const data = hit.data ?? {};
  const name = (hit.value || data.sku_display_name || data.sku_description || '').trim();
  const notes: string[] = [];
  const missing: string[] = [];

  const storePrice = (data.price ?? []).find((p) => p.store === ANONYMOUS_STORE);
  let shelfValue = asNumber(storePrice?.listPrice);
  let shelfField = `data.price[store=${ANONYMOUS_STORE}].listPrice`;
  if (shelfValue == null || shelfValue <= 0) {
    const fallback = asNumber(data.product_list_price);
    if (fallback != null && fallback > 0) {
      shelfValue = fallback;
      shelfField = 'data.product_list_price';
      notes.push(`shelf from ${shelfField} (store ${ANONYMOUS_STORE} listPrice absent)`);
    } else {
      shelfValue = null;
      missing.push('shelf price');
    }
  }
  if (
    storePrice &&
    shelfField.startsWith('data.price') &&
    typeof storePrice.formatPrice === 'number' &&
    shelfValue != null &&
    Math.abs(storePrice.formatPrice - shelfValue) > 0.009
  ) {
    notes.push(`formatPrice ${plainNumber(storePrice.formatPrice)} differs (unit reference, not the shelf)`);
  }

  const listValue = asNumber(data.product_list_price);
  const list =
    listValue != null && shelfValue != null && listValue !== shelfValue ? plainNumber(listValue) : '—';

  const eanRaw = data.product_main_ean;
  const ean = eanRaw == null || String(eanRaw).trim() === '' ? '' : String(eanRaw).trim();
  if (!ean) missing.push('EAN');

  const brand = data.product_brand?.trim() ?? '';
  if (!brand) missing.push('brand');

  const fromName = sizeFromName(name);
  const size = fromName ? `from name: ${fromName}` : '';
  const hasSize = Boolean(fromName);
  if (!hasSize) missing.push('size');

  const availability = data.store_availability;
  let available = '—';
  if (Array.isArray(availability)) {
    available = availability.some((id) => String(id) === ANONYMOUS_STORE) ? 'yes' : 'no';
  } else {
    missing.push('availability');
  }

  const promo = data.discounts?.find((d) => d.discountText?.trim())?.discountText?.trim();
  if (promo) notes.push(`promo text: ${promo}`);
  if (missing.length) notes.push(`missing: ${missing.join(', ')}`);

  return {
    query,
    name: name || '—',
    shelf: shelfValue != null && shelfValue > 0 ? plainNumber(shelfValue) : '—',
    shelfValue: shelfValue != null && shelfValue > 0 ? shelfValue : null,
    list,
    ean: ean || '—',
    brand: brand || '—',
    size: size || '—',
    available,
    notes: notes.join('; ') || '—',
    hasEan: Boolean(ean),
    hasBrand: Boolean(brand),
    hasSize,
  };
}

async function probeCoto(query: string, key: string): Promise<ProbeRow> {
  const params = new URLSearchParams({
    key,
    section: 'Products',
    num_results_per_page: '1',
  });
  const url = `https://ac.cnstrc.com/search/${encodeURIComponent(query)}?${params}`;
  try {
    const res = await getText(url, 'application/json');
    if (res.status !== 200) return blankRow(query, `HTTP ${res.status}`);
    const head = res.text.trimStart()[0];
    if (head !== '{' && head !== '[') return blankRow(query, 'non-JSON response (possible bot challenge)');
    const body = JSON.parse(res.text) as { response?: { results?: CotoHit[] } };
    return cotoRow(query, body.response?.results?.[0]);
  } catch (e) {
    if (e instanceof SyntaxError) return blankRow(query, 'non-JSON response (possible bot challenge)');
    return blankRow(query, publicFailure(e));
  }
}

function jumboSize(p: Product): { text: string; hasSize: boolean } {
  const fromName = sizeFromName(p.name);
  if (fromName) return { text: `from name: ${fromName}`, hasSize: true };
  return { text: '—', hasSize: false };
}

function jumboRow(query: string, p: Product | undefined): ProbeRow {
  if (!p) return blankRow(query, 'no results');
  const size = jumboSize(p);
  const notes: string[] = [];
  const missing: string[] = [];
  if (!(p.price.centavos > 0)) missing.push('shelf price');
  if (!p.ean?.trim()) missing.push('EAN');
  if (!p.brand?.trim()) missing.push('brand');
  if (!size.hasSize) missing.push('size');
  if (missing.length) notes.push(`missing: ${missing.join(', ')}`);
  return {
    query,
    name: p.name,
    shelf: p.price.centavos > 0 ? p.price.display : '—',
    shelfValue: p.price.centavos > 0 ? p.price.centavos / 100 : null,
    list: p.listPrice ? p.listPrice.display : '—',
    ean: p.ean?.trim() || '—',
    brand: p.brand?.trim() || '—',
    size: size.text,
    available: p.available ? 'yes' : 'no',
    notes: notes.join('; ') || '—',
    hasEan: Boolean(p.ean?.trim()),
    hasBrand: Boolean(p.brand?.trim()),
    hasSize: size.hasSize,
  };
}

async function probeJumbo(): Promise<ProbeRow[]> {
  const rows: ProbeRow[] = [];
  let ctx;
  try {
    ctx = await getAdapter('jumbo').resolveLocation(JUMBO_POSTAL);
  } catch (e) {
    const note = e instanceof Error ? e.message : 'request failed';
    return QUERIES.map((query) => blankRow(query, note));
  }
  const adapter = getAdapter('jumbo');
  for (const query of QUERIES) {
    await sleep(GAP_MS);
    try {
      const products = await adapter.search(query, ctx, { limit: 5 });
      rows.push(jumboRow(query, products[0]));
    } catch (e) {
      rows.push(blankRow(query, e instanceof Error ? e.message : 'request failed'));
    }
  }
  return rows;
}

function count(rows: ProbeRow[]): { shelf: number; ean: number; brand: number; size: number } {
  return {
    shelf: rows.filter((r) => r.shelfValue != null && r.shelfValue > 0).length,
    ean: rows.filter((r) => r.hasEan).length,
    brand: rows.filter((r) => r.hasBrand).length,
    size: rows.filter((r) => r.hasSize).length,
  };
}

function summaryLine(rows: ProbeRow[]): string {
  const c = count(rows);
  return `Shelf price ${c.shelf}/10, EAN ${c.ean}/10, brand ${c.brand}/10, size ${c.size}/10.`;
}

function table(rows: ProbeRow[]): string {
  const head = [
    '| # | Query | Name | Shelf price (ARS) | List price | EAN | Brand | Size | Available | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r, i) =>
    `| ${i + 1} | ${cell(r.query)} | ${cell(r.name)} | ${cell(r.shelf)} | ${cell(r.list)} | ${cell(r.ean)} | ${cell(r.brand)} | ${cell(r.size)} | ${cell(r.available)} | ${cell(r.notes)} |`,
  );
  return [...head, ...body].join('\n');
}

function render(when: string, coto: ProbeRow[], jumbo: ProbeRow[]): string {
  const priced = count(coto).shelf;
  const winner = priced >= 8 ? 'Coto' : 'Jumbo';
  const reason =
    winner === 'Coto'
      ? `anonymous Constructor search returned a numeric shelf price greater than 0 on ${priced} of 10 top results.`
      : `anonymous Constructor search returned a numeric shelf price greater than 0 on ${priced} of 10 top results, below the threshold of 8.`;
  return [
    '# Coto vs Jumbo anonymous search',
    '',
    `Ran: ${when}.`,
    '',
    `Coto endpoint: \`${COTO_ENDPOINT}\`.`,
    'No cookies, no Coto session, and no store id on the query string.',
    `Shelf price is \`data.price[store=${ANONYMOUS_STORE}].listPrice\` (pesos, as returned).`,
    `Store ${ANONYMOUS_STORE} is chosen locally: it is the branch the public storefront uses when no address is saved, and that row is already in the response.`,
    'If that row has no positive listPrice, the shelf falls back to `data.product_list_price` and the row says so.',
    'List price is `data.product_list_price` when it differs from the shelf.',
    'EAN is `data.product_main_ean`. Brand is `data.product_brand`.',
    'Size is the pack net content, taken from the product name (`value`) and marked `from name`.',
    'The response has no net-content field. `data.product_format_quantity` and `data.product_format` are the unit `formatPrice` is quoted per, and are not the size.',
    `Available is whether "${ANONYMOUS_STORE}" is in \`data.store_availability\`.`,
    '',
    '## Coto',
    '',
    table(coto),
    '',
    summaryLine(coto),
    '',
    '## Jumbo',
    '',
    `Existing VTEX adapter: \`getAdapter('jumbo').resolveLocation('${JUMBO_POSTAL}')\`, then \`search(query, ctx, { limit: 5 })\`. Top result only. No price check and no cart.`,
    'Shelf price is `price.display`. List price is `listPrice.display` when the adapter set one. EAN is `ean`. Brand is `brand`.',
    'Size is the pack net content, taken from `name` and marked `from name`. `unitMultiplier` and `measurementUnit` are the selling unit, and Product has no net-content field, so they are not the size. Available is `available`.',
    '',
    table(jumbo),
    '',
    summaryLine(jumbo),
    '',
    `Decision: ${winner} — ${reason}`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { day, when } = ranAt();
  const coto: ProbeRow[] = [];
  let keyError = '';
  let key = '';
  try {
    key = await discoverPublicKey();
  } catch (e) {
    keyError = e instanceof Error ? e.message : 'request failed';
  }

  for (const query of QUERIES) {
    await sleep(GAP_MS);
    if (!key) {
      coto.push(blankRow(query, keyError || 'public Constructor key unavailable'));
      continue;
    }
    coto.push(await probeCoto(query, key));
  }

  const jumbo = await probeJumbo();
  const markdown = render(when, coto, jumbo);
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'probes');
  const outFile = join(outDir, `coto-vs-jumbo-${day}.md`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, markdown, 'utf8');
  process.stdout.write(markdown);
  process.stdout.write(`\nWrote ${outFile}\n`);
}

await main();
