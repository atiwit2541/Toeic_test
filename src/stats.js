const STORAGE_KEY = "toeic-reading-attempts-v1";
const MAX_RECORDS = 500;

export function loadAttempts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveAttempt(record) {
  const attempts = loadAttempts();
  attempts.unshift(record);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(attempts.slice(0, MAX_RECORDS))
  );
}

export function clearAllAttempts() {
  localStorage.removeItem(STORAGE_KEY);
}
