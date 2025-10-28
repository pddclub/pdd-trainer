import { readJson, writeJson } from '../storage/session.js';

function safeParseAnswers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function buildImageUrl(baseUrl, path) {
  if (!path) return null;
  if (typeof path === 'string' && (path.startsWith('http') || path.startsWith('/'))) {
    return path;
  }
  return `${baseUrl}/storage/v1/object/public/${path}`;
}

async function fetchJSON(fetcher, url, opts = {}, { timeoutMs = 12000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetcher(url, controller ? { ...opts, signal: controller.signal } : opts);
      if (timer) clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastError = err;
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function fetchTicketQuestions({
  supabaseUrl,
  anonKey,
  topicNumber,
  ticketNumber,
  cacheKey,
  storage,
  fetcher = fetch
}) {
  const cached = readJson(cacheKey, { storage });
  if (Array.isArray(cached) && cached.length) {
    return cached;
  }

  const query =
    `${supabaseUrl}/rest/v1/questions` +
    `?select=id,question,answers,correct_answer,image_path,comment` +
    `&topic_number=eq.${topicNumber}` +
    `&ticket_number=eq.${ticketNumber}` +
    `&order=created_at.asc`;

  const raw = await fetchJSON(
    fetcher,
    query,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    }
  );

  const prepared = raw.map((q) => ({
    ...q,
    answers: safeParseAnswers(q.answers),
    image_url: q.image_path ? buildImageUrl(supabaseUrl, q.image_path) : null
  }));

  writeJson(cacheKey, prepared, { storage });
  return prepared;
}

export async function postAttemptToSupabase(payloadArray, {
  supabaseUrl,
  anonKey,
  fetcher = fetch
}) {
  const url = `${supabaseUrl}/rest/v1/attempts`;
  const body = JSON.stringify(payloadArray);
  return fetchJSON(
    fetcher,
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        Prefer: 'return=representation'
      },
      body
    },
    { timeoutMs: 12000, retries: 1 }
  );
}

export { buildImageUrl, safeParseAnswers, fetchJSON };
