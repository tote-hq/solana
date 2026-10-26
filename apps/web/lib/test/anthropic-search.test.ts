import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { errorCode } from '../analytics.ts';
import {
  AnthropicAuthError,
  anthropicApiKey,
  anthropicProvider,
  searchUnavailableCopy,
} from '../agent/providers/anthropic.ts';
import type { HopRequest } from '../agent/providers/types.ts';

/**
 * A Messages API stream whose only action is a product search.
 * Shaped like the SSE the SDK accumulates: message, one tool block, stop.
 */
function searchStream(): string {
  const frames = [
    {
      type: 'message_start',
      message: {
        id: 'msg_search',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-sonnet-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_search', name: 'search_products', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"leche descremada"}' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 8 },
    },
    { type: 'message_stop' },
  ];
  return frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join('');
}

const SEARCH: HopRequest = {
  system: [{ type: 'text', text: 'Search the supermarket.' }],
  tools: [
    {
      name: 'search_products',
      description: 'Find products',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  ],
  messages: [{ role: 'user', content: 'leche descremada' }],
  budgetMs: 5_000,
};

const KEY = 'test-console-key';

function restoreEnv(prev: string | undefined) {
  if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prev;
}

describe('anthropic product search', () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevFetch = globalThis.fetch;
  afterEach(() => {
    restoreEnv(prevKey);
    globalThis.fetch = prevFetch;
  });

  it('calls the Messages API and reads a search_products tool call', async () => {
    process.env.ANTHROPIC_API_KEY = `"${KEY}"`;
    let url = '';
    let apiKey = '';
    let version = '';
    let body: Record<string, unknown> = {};

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      url = req.url;
      apiKey = req.headers.get('x-api-key') ?? '';
      version = req.headers.get('anthropic-version') ?? '';
      body = JSON.parse(await req.text()) as Record<string, unknown>;
      return new Response(searchStream(), {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' },
      });
    }) as typeof fetch;

    const result = await anthropicProvider().hop(SEARCH, {
      onText() {},
      onThinking() {},
    });

    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(apiKey, KEY);
    assert.equal(version, '2023-06-01');
    assert.equal(body.model, 'claude-sonnet-5');
    assert.equal((body.thinking as { type?: string } | undefined)?.type, 'adaptive');
    const tools = body.tools as { name: string }[];
    assert.equal(tools.some((tool) => tool.name === 'search_products'), true);
    assert.equal(result.stopReason, 'tool_use');
    const call = result.content.find((block) => block.type === 'tool_use');
    assert.ok(call && call.type === 'tool_use');
    assert.equal(call.name, 'search_products');
    assert.deepEqual(call.input, { query: 'leche descremada' });
  });

  it('does not show a rejected key to the shopper', async () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    const secret = 'req_should_not_leak';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
          request_id: secret,
        }),
        { status: 401, headers: { 'content-type': 'application/json', 'request-id': secret } },
      )) as typeof fetch;

    await assert.rejects(anthropicProvider().hop(SEARCH, { onText() {}, onThinking() {} }), (err: unknown) => {
      assert.ok(err instanceof AnthropicAuthError);
      const text = err instanceof Error ? err.message : String(err);
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes('invalid x-api-key'), false);
      assert.equal(text.includes(KEY), false);
      return true;
    });
  });

  it('refuses an OAuth token before calling the API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-oat-example';
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('', { status: 500 });
    }) as typeof fetch;

    await assert.rejects(anthropicProvider().hop(SEARCH, { onText() {}, onThinking() {} }), AnthropicAuthError);
    assert.equal(called, false);
  });

  it('strips quotes and a bearer prefix from the key', () => {
    const withKey = (value: string | undefined): NodeJS.ProcessEnv => ({ ...process.env, ANTHROPIC_API_KEY: value });
    assert.equal(anthropicApiKey(withKey('  "quoted-key"  ')), 'quoted-key');
    assert.equal(anthropicApiKey(withKey("'quoted-key'")), 'quoted-key');
    assert.equal(anthropicApiKey(withKey('Bearer quoted-key')), 'quoted-key');
    const missing = { ...process.env };
    delete missing.ANTHROPIC_API_KEY;
    assert.equal(anthropicApiKey(missing), '');
  });

  it('says search is unavailable in both languages, and analytics can name it', () => {
    assert.equal(searchUnavailableCopy('es'), 'La búsqueda no está disponible ahora. Probá de nuevo en un rato.');
    assert.equal(searchUnavailableCopy('en'), 'Search is unavailable right now. Try again in a moment.');
    assert.equal(errorCode(searchUnavailableCopy('es')), 'provider');
    assert.equal(errorCode(searchUnavailableCopy('en')), 'provider');
  });
});
