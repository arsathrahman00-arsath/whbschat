// Persists the "used" state of approve/reject action buttons embedded in
// backend HTML messages. Keyed by message id so the disabled state survives
// page reloads even if the backend hasn't yet annotated the HTML itself.
//
// Backends that DO send an authoritative status (e.g. "approved" / "rejected")
// on the message object should pass that to `isMessageActioned` — it wins
// over the local cache.

const STORAGE_KEY = "whchat_html_action_state_v1";

type Store = Record<string, { action: string; at: number }>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function getMessageAction(messageId: string | number | undefined | null): string | null {
  if (messageId == null) return null;
  const store = readStore();
  return store[String(messageId)]?.action ?? null;
}

export function setMessageAction(messageId: string | number, action: string) {
  if (messageId == null) return;
  const store = readStore();
  store[String(messageId)] = { action, at: Date.now() };
  writeStore(store);
}

/** True if buttons in this message should be permanently disabled. */
export function isMessageActioned(
  messageId: string | number | undefined | null,
  backendStatus?: string | null,
): boolean {
  if (backendStatus) {
    const s = String(backendStatus).toLowerCase();
    if (s === "approved" || s === "rejected" || s === "approve" || s === "reject" || s === "done" || s === "completed") {
      return true;
    }
  }
  return getMessageAction(messageId) != null;
}
