import Anthropic from '@anthropic-ai/sdk';

import type { HopCallbacks, HopRequest, HopResult, Provider } from './types';

/**
 * The hosted model, and now the only one.
 *
 * Everything here was in `loop.ts` before there was anything to choose between;
 * lifting it out unchanged was the point, so that the path carrying real
 * traffic was provably the same one. The thing it was lifted out *for* — a
 * local model on a machine at home — is gone, because it was slower than the
 * hosted model rather than cheaper in any way that showed up. The interface
 * stays: it costs one indirection and it is where the speed knobs live.
 */

// Override to compare: AGENT_MODEL=claude-haiku-4-5-20251001 npm run dev
const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5';

/**
 * Adaptive thinking and the effort control are Claude 5 features — Haiku 4.5
 * rejects the request outright with "adaptive thinking is not supported on
 * this model". It still thinks, it just wants a fixed budget instead. Swapping
 * MODEL alone is not enough; the request shape has to follow.
 */
const isClaude5 = /^claude-(opus|sonnet|fable)-5/.test(MODEL);
const THINKING = isClaude5
  ? ({ type: 'adaptive', display: 'summarized' } as const)
  : ({ type: 'enabled', budget_tokens: 2048 } as const);
/**
 * How hard the model thinks before it acts, and the one knob here that is about
 * the shopper waiting rather than about correctness.
 *
 * `low`, not `medium`. Adaptive thinking runs *before every tool call*, and a
 * basket is up to twelve of them — so a second of extra deliberation per hop is
 * twelve seconds the shopper spends watching "Buscando…". The work in this loop
 * does not need the deliberation: each hop is a small, well-posed step with the
 * tool schemas in front of it (search this, add that, then draw it), and the
 * prompt already says which tool comes next.
 *
 * It is env-overridable because that claim is worth being able to test rather
 * than argue about. `AGENT_EFFORT=medium` restores exactly what shipped before.
 * If baskets start coming back wrong rather than slow, that is the first thing
 * to move — and moving it is a deploy, not a patch.
 */
const EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
type Effort = (typeof EFFORT_LEVELS)[number];
const asEffort = (v: string | undefined): Effort | null =>
  EFFORT_LEVELS.includes(v as Effort) ? (v as Effort) : null;
const EFFORT_LEVEL = asEffort(process.env.AGENT_EFFORT?.trim().toLowerCase()) ?? 'low';
const EFFORT = isClaude5 ? { output_config: { effort: EFFORT_LEVEL } } : {};

/**
 * The shopper-facing line when Anthropic refuses the key.
 *
 * Both languages, because this string is what the chat shows and what
 * `errorCode` classifies. It names no key, no status and no request id.
 */
export function searchUnavailableCopy(lang: 'es' | 'en'): string {
  return lang === 'en'
    ? 'Search is unavailable right now. Try again in a moment.'
    : 'La búsqueda no está disponible ahora. Probá de nuevo en un rato.';
}

/** Thrown when the Messages API rejects the credential. The message is a code, not copy. */
export class AnthropicAuthError extends Error {
  constructor() {
    super('anthropic_auth');
    this.name = 'AnthropicAuthError';
  }
}

/**
 * `ANTHROPIC_API_KEY` as the header should carry it.
 *
 * A value pasted with quotes, a BOM or a leading "Bearer " still looks set,
 * and the API then answers 401 `invalid x-api-key` — which is what a search
 * showed after the switch onto this provider. The SDK trims whitespace and
 * nothing else, so the cleaning happens before the client is built.
 */
export function anthropicApiKey(env: NodeJS.ProcessEnv = process.env): string {
  let key = env.ANTHROPIC_API_KEY?.trim() ?? '';
  if (key.charCodeAt(0) === 0xfeff) key = key.slice(1).trim();
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim();
  return key;
}

function statusOf(e: unknown): number | undefined {
  if (!e || typeof e !== 'object' || !('status' in e)) return undefined;
  const status = (e as { status: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function rethrowAnthropic(e: unknown): never {
  const status = statusOf(e);
  if (status === 401) {
    // Status only. The body can echo the request, and the key must not land
    // in a log or in the shopper's transcript.
    console.error('[anthropic] API rejected ANTHROPIC_API_KEY');
    throw new AnthropicAuthError();
  }
  if (status !== undefined) {
    const type =
      e && typeof e === 'object' && 'type' in e && typeof (e as { type: unknown }).type === 'string'
        ? (e as { type: string }).type
        : '';
    console.error('[anthropic]', status, type);
    throw new Error(`Anthropic respondió ${status}.`);
  }
  throw e;
}

export function anthropicProvider(): Provider {
  // Built per turn rather than at module scope, as it was before: the API key
  // is read at construction, and a build without one should not fail at import.
  const apiKey = anthropicApiKey();
  // An OAuth token (sk-ant-oat…) sent as x-api-key is the same 401 as a bad
  // key. Refuse it before the request so the log says which mistake it was.
  const oauth = apiKey.startsWith('sk-ant-oat');
  const client = apiKey && !oauth ? new Anthropic({ apiKey }) : null;

  return {
    kind: 'anthropic',
    label: MODEL,

    async hop(req: HopRequest, cb: HopCallbacks): Promise<HopResult> {
      if (!apiKey) {
        // The only model there is. There used to be a local one to point at
        // here, and that sentence outliving it would send the next person
        // setting up a clone after an env var that does nothing.
        throw new Error('Falta ANTHROPIC_API_KEY. Ver DEPLOY.md.');
      }
      if (!client) {
        console.error('[anthropic] ANTHROPIC_API_KEY is an OAuth token, not a console API key');
        throw new AnthropicAuthError();
      }
      try {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 8192,
          thinking: THINKING,
          ...EFFORT,
          system: req.system,
          tools: req.tools,
          messages: req.messages,
        });

        stream.on('text', (delta) => cb.onText(delta));
        stream.on('thinking', (delta) => cb.onThinking(delta));

        const msg = await stream.finalMessage();

        if (process.env.AGENT_USAGE) {
          const u = msg.usage;
          console.log(
            `[usage] ${MODEL} in=${u.input_tokens} out=${u.output_tokens} ` +
              `cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`,
          );
        }

        return { content: msg.content, stopReason: msg.stop_reason };
      } catch (e) {
        rethrowAnthropic(e);
      }
    },
  };
}
