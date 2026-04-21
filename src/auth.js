/** Session for Vercel-protected deploy (see README). */
const AUTH_KEY = "toeic-site-auth-v1";

export function authGateRequired() {
  if (import.meta.env.VITE_SKIP_AUTH === "1") return false;
  if (import.meta.env.DEV) return false;
  return true;
}

export function isLoggedIn() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLoggedIn() {
  try {
    sessionStorage.setItem(AUTH_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}
