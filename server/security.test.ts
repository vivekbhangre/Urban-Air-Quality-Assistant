import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeText,
  SlidingWindowRateLimiter,
  validateChatRequest,
  validateHackRequest,
  validateProfilePayload,
} from './security';
import {
  BoundedTtlCache,
  generateWithModelFallback,
  mapGeminiError,
  parseModelJson,
  profileCacheKey,
} from './gemini';

test('sanitizeText strips control characters and enforces max length', () => {
  const dirty = '  Kraków\u0000\u0007 Winter\u001F  ';
  assert.equal(sanitizeText(dirty, 50), 'Kraków Winter');
  assert.equal(sanitizeText('a'.repeat(200), 10).length, 10);
  assert.equal(sanitizeText(12345, 20), '');
});

test('validateProfilePayload rejects missing city and clamps numeric bounds', () => {
  const bad = validateProfilePayload({ city: ' ', currentAqi: 999 });
  assert.equal(bad.ok, false);

  const ok = validateProfilePayload({
    city: 'Salt Lake City, UT',
    currentAqi: 999,
    outdoorPm25: -20,
    householdSize: 40,
    communityHomes: 0,
    heating: 'invalid_enum',
    sensitivities: ['children', 'injected_role'],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.currentAqi, 500);
    assert.equal(ok.data.outdoorPm25, 0);
    assert.equal(ok.data.householdSize, 25);
    assert.equal(ok.data.communityHomes, 1);
    assert.equal(ok.data.heating, 'gas_furnace');
    assert.deepEqual(ok.data.sensitivities, ['children']);
  }
});

test('validateHackRequest enforces minimum challenge length and trims payload', () => {
  assert.equal(validateHackRequest({ challenge: 'short' }).ok, false);
  const valid = validateHackRequest({
    challenge: 'Drafty north windows and gas range in a 2-bedroom apartment',
    profile: { city: 'Milan, Italy', currentAqi: 164 },
  });
  assert.equal(valid.ok, true);
});

test('validateChatRequest bounds history length and strips blank turns', () => {
  assert.equal(validateChatRequest({ messages: [] }).ok, false);
  const many = Array.from({ length: 15 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1}`,
  }));
  const res = validateChatRequest({ messages: many });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.messages.length, 10);
    assert.equal(res.messages[0].content, 'Message 6');
  }
});

test('SlidingWindowRateLimiter blocks above threshold and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(2, 10_000, 10);
  assert.equal(limiter.check('127.0.0.1', 1000).allowed, true);
  assert.equal(limiter.check('127.0.0.1', 2000).allowed, true);
  const blocked = limiter.check('127.0.0.1', 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 8);

  // After window expires, requests are allowed again
  assert.equal(limiter.check('127.0.0.1', 12_500).allowed, true);
});

test('BoundedTtlCache expires stale entries and evicts oldest beyond max size', () => {
  const cache = new BoundedTtlCache<string>(5_000, 2);
  cache.set('a', 'first', 1000);
  cache.set('b', 'second', 1000);
  cache.set('c', 'third', 1000);

  assert.equal(cache.get('a', 1500), undefined);
  assert.equal(cache.get('b', 1500), 'second');
  assert.equal(cache.get('c', 6500), undefined);
});

test('parseModelJson strips markdown code fences cleanly', () => {
  const parsed = parseModelJson<{ reply: string }>('```json\n{"reply":"Keep windows closed tonight."}\n```');
  assert.equal(parsed.reply, 'Keep windows closed tonight.');
});

test('profileCacheKey is invariant to sensitivity ordering', () => {
  const base = {
    city: 'Kraków, Poland',
    regionLabel: 'Vistula',
    currentAqi: 218,
    outdoorPm25: 168,
    householdSize: 4,
    communityHomes: 100,
    heating: 'gas_furnace',
    commute: 'solo_car',
    cooking: 'gas_stove',
    building: 'older_drafty',
  };
  const k1 = profileCacheKey({ ...base, sensitivities: ['children', 'asthma_respiratory'] });
  const k2 = profileCacheKey({ ...base, sensitivities: ['asthma_respiratory', 'children'] });
  assert.equal(k1, k2);
});

test('generateWithModelFallback switches to secondary model on 429 quota error and respects cooldown', async () => {
  const called: string[] = [];
  const cooldowns = new Map<string, number>();

  const result = await generateWithModelFallback(
    async (model) => {
      called.push(model);
      if (model === 'gemini-4-hydrogen') {
        throw new Error('429 RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProjectPerModel-FreeTier');
      }
      return `ok:${model}`;
    },
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
    cooldowns,
    1000
  );

  assert.equal(result, 'ok:gemini-3.1-flash-lite');
  assert.deepEqual(called, ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

  // Second call within cooldown skips exhausted primary directly
  called.length = 0;
  const second = await generateWithModelFallback(
    async (model) => {
      called.push(model);
      return `ok:${model}`;
    },
    ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
    cooldowns,
    2000
  );
  assert.equal(second, 'ok:gemini-3.1-flash-lite');
  assert.deepEqual(called, ['gemini-3.1-flash-lite']);

  const mapped429 = mapGeminiError(new Error('429 RESOURCE_EXHAUSTED'));
  assert.equal(mapped429.status, 429);
  assert.match(mapped429.message, /Settings > Secrets/);
});
