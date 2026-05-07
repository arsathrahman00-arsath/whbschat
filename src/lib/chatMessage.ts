// Normalized chat message model + mappers shared by realtime + history.
// Single source of truth for the UI — both WS payloads and API payloads
// must be funneled through `mapToChatMessage` before reaching components.

export type AttachmentKind = "image" | "video" | "document";

export interface ChatAttachment {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  message_type: AttachmentKind;
  url: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id?: string;
  message: string | null;
  deleted: boolean;
  created_at: string;
  reply_to?: {
    id?: string;
    text: string;
    sender: string;
    sender_id?: string;
  } | null;
  file?: ChatAttachment | null;
  // UI-only fields
  uploading?: boolean;
  upload_error?: string | null;
}

export const FILE_BASE = "https://ngrchatbot.whindia.in";

/** Resolve any backend-provided URL/path to an absolute URL on FILE_BASE. */
export function resolveFileUrl(input: string | number | null | undefined): string {
  if (input == null) return "";
  const s = String(input).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  // Relative path returned by backend (e.g. "/chat/media-file/123/")
  if (s.startsWith("/")) return `${FILE_BASE}${s}`;
  // Bare id
  return `${FILE_BASE}/chat/media-file/${s}/`;
}

/** Back-compat alias. */
export function buildFileUrl(fileId: string | number): string {
  return resolveFileUrl(fileId);
}

export function kindFromMime(mime: string | undefined): AttachmentKind {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "document";
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * Normalize anything that looks like a chat message (history API row,
 * WebSocket broadcast, or local optimistic object) into a ChatMessage.
 */
export function mapToChatMessage(raw: any, currentUserId: string | number): ChatMessage {
  const senderId = String(raw.sender_id ?? raw.from ?? "");
  const receiverId = raw.receiver_id != null ? String(raw.receiver_id) : undefined;

  // --- File / attachment ---
  let file: ChatAttachment | null = null;
  const f = raw.file ?? null;

  if (f && typeof f === "object") {
    // Already in the normalized shape (ish)
    const fid = String(f.id ?? f.file_id ?? "");
    const rawUrl = f.url || (f.file_url as string) || "";
    const url = rawUrl ? resolveFileUrl(rawUrl) : (fid ? resolveFileUrl(fid) : "");
    if (url || fid) {
      file = {
        id: fid,
        name: f.name || f.file_name || "file",
        mime_type: f.mime_type || f.type || "",
        size: Number(f.size ?? f.file_size ?? 0),
        message_type: (f.message_type as AttachmentKind) || kindFromMime(f.mime_type || f.type),
        url,
      };
    }
  } else if (raw.file_id || raw.file_url) {
    // Flat attachment fields on the message
    const fid = String(raw.file_id ?? "");
    const url = raw.file_url ? resolveFileUrl(raw.file_url) : (fid ? resolveFileUrl(fid) : "");
    file = {
      id: fid,
      name: raw.file_name || "file",
      mime_type: raw.mime_type || raw.file_type || "",
      size: Number(raw.file_size ?? 0),
      message_type: (raw.message_type as AttachmentKind) || kindFromMime(raw.mime_type || raw.file_type),
      url,
    };
  }

  // --- Reply ---
  let reply: ChatMessage["reply_to"] = null;
  if (raw.reply_to && typeof raw.reply_to === "object") {
    const rsid = raw.reply_to.sender_id != null ? String(raw.reply_to.sender_id) : undefined;
    reply = {
      id: raw.reply_to.id != null ? String(raw.reply_to.id) : undefined,
      text: raw.reply_to.text || raw.reply_to.message || "",
      sender:
        rsid && String(rsid) === String(currentUserId)
          ? "You"
          : raw.reply_to.sender || raw.reply_to.sender_name || "User",
      sender_id: rsid,
    };
  }

  return {
    id: String(raw.id ?? raw.message_id ?? `tmp-${Date.now()}-${Math.random()}`),
    sender_id: senderId,
    receiver_id: receiverId,
    message: raw.message ?? raw.text ?? null,
    deleted: truthyFlag(raw.deleted) || truthyFlag(raw.cb_message_deleted) || truthyFlag(raw.is_deleted),
    created_at: raw.created_at || raw.time || new Date().toISOString(),
    reply_to: reply,
    file,
  };
}

export function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
