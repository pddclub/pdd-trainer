import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../trainer/index.js';

test('parseHash supports namespaced ticket hashes', () => {
  assert.deepEqual(parseHash('#t1-2'), { topic: 1, ticket: 2 });
  assert.deepEqual(parseHash('#T10-3'), { topic: 10, ticket: 3 });
  assert.deepEqual(parseHash('#t-5'), { topic: 1, ticket: 5 });
  assert.deepEqual(parseHash('#5'), { topic: 1, ticket: 5 });
  assert.deepEqual(parseHash('#'), { topic: 1, ticket: 1 });
});
