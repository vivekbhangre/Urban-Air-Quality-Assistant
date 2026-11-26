import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultPersistedState,
  loadPersistedState,
  savePersistedState,
  STORAGE_KEY,
  type StorageLike,
} from './storage';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

test('loadPersistedState returns defaults when storage is empty or malformed', () => {
  const fallback = createDefaultPersistedState();
  assert.deepEqual(loadPersistedState(createMemoryStorage()), fallback);

  const corrupted = createMemoryStorage({ [STORAGE_KEY]: '{invalid-json' });
  assert.deepEqual(loadPersistedState(corrupted), fallback);
});

test('loadPersistedState hydrates partial state and filters invalid custom hacks', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      profile: {
        city: 'Milan, Italy',
        currentAqi: 164,
        sensitivities: ['children'],
      },
      customHacks: [
        { id: 'bad-hack' },
        { id: 'good-hack', title: 'Door Sweep', steps: ['Measure door'] },
      ],
      selectedSwapIds: ['swap-no-wood-burn', 42],
    }),
  });

  const hydrated = loadPersistedState(storage);
  assert.equal(hydrated.profile.city, 'Milan, Italy');
  assert.equal(hydrated.profile.currentAqi, 164);
  assert.deepEqual(hydrated.profile.sensitivities, ['children']);
  assert.equal(hydrated.customHacks.length, 1);
  assert.equal(hydrated.customHacks[0].id, 'good-hack');
  assert.deepEqual(hydrated.selectedSwapIds, ['swap-no-wood-burn']);
});

test('savePersistedState writes cleanly and ignores quota errors', () => {
  const storage = createMemoryStorage();
  const state = createDefaultPersistedState();
  savePersistedState(state, storage);
  assert.equal(loadPersistedState(storage).profile.city, state.profile.city);

  const throwingStorage: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.doesNotThrow(() => savePersistedState(state, throwingStorage));
});
