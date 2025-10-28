const DEFAULT_STATE_FACTORY = (length, now = Date.now()) => ({
  answers: {},
  currentIdx: 0,
  finished: false,
  length,
  startedAt: now
});

function resolveStorage(provided) {
  if (provided) return provided;
  if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) return globalThis.sessionStorage;
  return null;
}

export function readJson(key, { storage } = {}) {
  if (!key) return null;
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function writeJson(key, value, { storage } = {}) {
  if (!key) return false;
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export function removeKeys(keys, { storage } = {}) {
  const target = resolveStorage(storage);
  if (!target || !Array.isArray(keys)) return;
  for (const key of keys) {
    if (!key) continue;
    try {
      target.removeItem(key);
    } catch (err) {
      // ignore storage errors
    }
  }
}

export function loadTrainerState(key, length, { storage, nowProvider = () => Date.now() } = {}) {
  const existing = readJson(key, { storage });
  if (existing && typeof existing === 'object') {
    return existing;
  }
  return DEFAULT_STATE_FACTORY(length, nowProvider());
}

export function saveTrainerState(key, state, { storage } = {}) {
  return writeJson(key, state, { storage });
}

export function clearTrainerData(keys, { storage } = {}) {
  removeKeys(keys, { storage });
}
