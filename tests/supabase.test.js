import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchTicketQuestions,
  postAttemptToSupabase,
  buildImageUrl,
  safeParseAnswers
} from '../services/supabase.js';

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

test('safeParseAnswers converts strings to arrays and ignores invalid JSON', () => {
  assert.deepEqual(safeParseAnswers('[1,2,3]'), [1, 2, 3]);
  assert.deepEqual(safeParseAnswers('[invalid'), []);
  assert.deepEqual(safeParseAnswers(null), []);
});

test('buildImageUrl keeps absolute URLs and builds storage path', () => {
  assert.equal(
    buildImageUrl('https://example.supabase.co', 'https://cdn.example.com/file.jpg'),
    'https://cdn.example.com/file.jpg'
  );
  assert.equal(
    buildImageUrl('https://example.supabase.co', 'path/to/file.jpg'),
    'https://example.supabase.co/storage/v1/object/public/path/to/file.jpg'
  );
});

test('fetchTicketQuestions returns cached questions without network call', async () => {
  const cacheKey = 'cache-key';
  const cached = [{ id: 1 }];
  const storage = createStorage({ [cacheKey]: JSON.stringify(cached) });
  let called = false;

  const result = await fetchTicketQuestions({
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon',
    topicNumber: 1,
    ticketNumber: 1,
    cacheKey,
    storage,
    fetcher: async () => {
      called = true;
      return { ok: true, json: async () => [] };
    }
  });

  assert.deepEqual(result, cached);
  assert.equal(called, false);
});

test('fetchTicketQuestions fetches data and normalises answers/images', async () => {
  const cacheKey = 'cache-key-2';
  const storage = createStorage();
  const payload = [
    {
      id: 1,
      question: 'Q1',
      answers: '[{"text":"A1"}]',
      correct_answer: 1,
      image_path: 'images/a.png'
    }
  ];

  let receivedUrl;
  let receivedHeaders;
  const fakeFetch = async (url, options = {}) => {
    receivedUrl = url;
    receivedHeaders = options.headers;
    return {
      ok: true,
      async json() {
        return payload;
      }
    };
  };

  const result = await fetchTicketQuestions({
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon',
    topicNumber: 2,
    ticketNumber: 3,
    cacheKey,
    storage,
    fetcher: fakeFetch
  });

  assert.match(receivedUrl, /topic_number=eq.2/);
  assert.match(receivedUrl, /ticket_number=eq.3/);
  assert.equal(receivedHeaders.Authorization, 'Bearer anon');
  assert.equal(result[0].answers[0].text, 'A1');
  assert.equal(
    result[0].image_url,
    'https://example.supabase.co/storage/v1/object/public/images/a.png'
  );
});

test('postAttemptToSupabase sends POST request with payload', async () => {
  let calledWith;
  const fakeFetch = async (url, options = {}) => {
    calledWith = { url, options };
    return {
      ok: true,
      async json() {
        return { status: 'ok' };
      }
    };
  };

  const payload = [{ id: 1 }];
  await postAttemptToSupabase(payload, {
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon',
    fetcher: fakeFetch
  });

  assert.equal(calledWith.url, 'https://example.supabase.co/rest/v1/attempts');
  assert.equal(calledWith.options.method, 'POST');
  assert.equal(JSON.parse(calledWith.options.body)[0].id, 1);
  assert.equal(calledWith.options.headers['Content-Type'], 'application/json');
});
