import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, writeJson, loadTrainerState, saveTrainerState, clearTrainerData } from '../storage/session.js';

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test('readJson returns parsed value and writeJson persists JSON', () => {
  const storage = createStorage();
  const success = writeJson('key', { a: 1 }, { storage });
  assert.equal(success, true);
  assert.deepEqual(readJson('key', { storage }), { a: 1 });
});

test('loadTrainerState returns stored state when available', () => {
  const stored = { answers: { 0: true }, currentIdx: 1, finished: false };
  const storage = createStorage({ state: JSON.stringify(stored) });
  const result = loadTrainerState('state', 10, { storage, nowProvider: () => 123 });
  assert.deepEqual(result, stored);
});

test('loadTrainerState creates default when storage empty', () => {
  const storage = createStorage();
  const result = loadTrainerState('state', 5, { storage, nowProvider: () => 999 });
  assert.equal(result.length, 5);
  assert.equal(result.startedAt, 999);
  assert.equal(result.finished, false);
});

test('saveTrainerState writes JSON and clearTrainerData removes keys', () => {
  const storage = createStorage();
  saveTrainerState('state', { foo: 'bar' }, { storage });
  assert.deepEqual(readJson('state', { storage }), { foo: 'bar' });
  clearTrainerData(['state'], { storage });
  assert.equal(readJson('state', { storage }), null);
});
