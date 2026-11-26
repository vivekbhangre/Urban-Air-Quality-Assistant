import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import { SlidingWindowRateLimiter } from './security.ts';

async function withTestServer(
  rateLimiter: SlidingWindowRateLimiter,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const app = await createApp({ rateLimiter });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
}

test('Express app serves /api/health with protective headers and rejects unknown /api routes cleanly', async () => {
  await withTestServer(new SlidingWindowRateLimiter(10, 60_000, 100), async (baseUrl) => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-dns-prefetch-control'), 'off');
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    const healthBody = (await healthRes.json()) as { ok: boolean };
    assert.equal(healthBody.ok, true);

    const notFoundRes = await fetch(`${baseUrl}/api/unknown-route`);
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = (await notFoundRes.json()) as { error: string };
    assert.match(notFoundBody.error, /not found/i);
  });
});

test('Express app handles malformed JSON, validation errors, and rate limits cleanly', async () => {
  await withTestServer(new SlidingWindowRateLimiter(2, 60_000, 100), async (baseUrl) => {
    const badJsonRes = await fetch(`${baseUrl}/api/plan/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"profile":',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonBody = (await badJsonRes.json()) as { error: string };
    assert.match(badJsonBody.error, /malformed json/i);

    for (let i = 0; i < 2; i += 1) {
      const invalidProfileRes = await fetch(`${baseUrl}/api/plan/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { city: '' } }),
      });
      assert.equal(invalidProfileRes.status, 400);
    }

    // Next request hits the 2-request rate limit
    const rateLimitedRes = await fetch(`${baseUrl}/api/plan/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { city: '' } }),
    });
    assert.equal(rateLimitedRes.status, 429);
    assert.ok(Number(rateLimitedRes.headers.get('retry-after')) >= 1);
  });
});
