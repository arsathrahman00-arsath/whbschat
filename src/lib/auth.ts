// Centralized auth + token storage helpers.
// - Persists JWT in localStorage under "chat_token"
// - Persists user object under "chat_user" (stringified JSON)
// - Provides logout() that clears storage and redirects to /login
// - Provides apiFetch() that auto-attaches `Authorization: Bearer <token>`
//   and triggers logout on 401 responses.

export const TOKEN_KEY = "chat_token";
export const USER_KEY = "chat_user";

export interface StoredUser {
  id: string | number;
  username: string;
  [key: string]: unknown;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function getStoredUser<T extends StoredUser = StoredUser>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // legacy session
    sessionStorage.removeItem("whchat_session");
  } catch {
    /* ignore */
  }
}

/** Clear auth and hard-redirect to login. */
export function logout(): void {
  clearAuth();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

/** Require a token before making a request; redirect to login if missing. */
export function requireToken(): string | null {
  const t = getToken();
  if (!t) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
    return null;
  }
  return t;
}

export interface ApiFetchOptions extends RequestInit {
  /** If true (default), redirect to /login when no token is present. */
  requireAuth?: boolean;
  /** If true (default), call logout() on 401 responses. */
  logoutOn401?: boolean;
}

/**
 * Wrapper around fetch that automatically:
 *  - attaches `Authorization: Bearer <token>` when a token exists
 *  - logs the user out on a 401 response
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {},
): Promise<Response> {
  const { requireAuth = true, logoutOn401 = true, headers, ...rest } = init;

  const token = getToken();
  if (requireAuth && !token) {
    requireToken();
    // Return a rejected-looking response so callers' try/catch fires.
    throw new Error("Not authenticated");
  }

  const finalHeaders = new Headers(headers || {});
  if (token && !finalHeaders.has("Authorization")) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, { ...rest, headers: finalHeaders });
  if (res.status === 401 && logoutOn401) {
    logout();
  }
  return res;
}

/** Safe filename extension validator. */
const DEFAULT_ALLOWED_EXT = [
  "jpg","jpeg","png","gif","webp","bmp","svg",
  "mp4","webm","mov","m4v",
  "mp3","wav","ogg","m4a",
  "pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","zip",
];

export function isAllowedFile(
  name: string,
  allowed: string[] = DEFAULT_ALLOWED_EXT,
): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return !!ext && allowed.includes(ext);
}