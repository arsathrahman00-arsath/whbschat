// Normalize backend channel/post payloads into our UI types.
// Tolerant of small shape variations (snake_case vs camelCase, nested file).

import { kindFromMime, resolveFileUrl, type ChatAttachment, type AttachmentKind } from "./chatMessage";
import type { Channel, ChannelPost } from "./channelTypes";

export function mapToChannel(raw: any, currentUserId?: string | number): Channel {
  const adminId = raw.admin_id ?? raw.created_by ?? raw.creator_id;
  return {
    id: raw.id ?? raw.channel_id,
    name: raw.name ?? raw.channel_name ?? "",
    description: raw.description ?? raw.about ?? null,
    admin_id: adminId,
    admin_name: raw.admin_name ?? raw.creator_name ?? null,
    created_at: raw.created_at ?? raw.time,
    members_count: Number(raw.members_count ?? raw.subscribers_count ?? 0) || 0,
    is_admin:
      raw.is_admin === true ||
      (currentUserId != null && adminId != null && String(adminId) === String(currentUserId)),
    unread_count: Number(raw.unread_count ?? raw.unread ?? 0) || 0,
    last_message:
      raw.last_message ?? raw.last_post ?? raw.last_message_text ?? null,
    last_message_time:
      raw.last_message_time ?? raw.last_post_time ?? raw.last_activity ?? raw.updated_at ?? null,
  };
}

function extractFile(raw: any): ChatAttachment | null {
  const f = raw.file ?? null;
  if (f && typeof f === "object") {
    const fid = String(f.id ?? f.file_id ?? "");
    const rawUrl = f.url || f.file_url || "";
    const url = rawUrl ? resolveFileUrl(rawUrl) : fid ? resolveFileUrl(fid) : "";
    if (!url && !fid) return null;
    return {
      id: fid,
      name: f.name || f.file_name || "file",
      mime_type: f.mime_type || f.type || "",
      size: Number(f.size ?? f.file_size ?? 0),
      message_type: (f.message_type as AttachmentKind) || kindFromMime(f.mime_type || f.type),
      url,
    };
  }
  if (raw.file_id || raw.file_url) {
    const fid = String(raw.file_id ?? "");
    const url = raw.file_url ? resolveFileUrl(raw.file_url) : fid ? resolveFileUrl(fid) : "";
    return {
      id: fid,
      name: raw.file_name || "file",
      mime_type: raw.mime_type || raw.file_type || "",
      size: Number(raw.file_size ?? 0),
      message_type: (raw.message_type as AttachmentKind) || kindFromMime(raw.mime_type || raw.file_type),
      url,
    };
  }
  return null;
}

export function mapToChannelPost(raw: any, channelId: string | number): ChannelPost {
  return {
    id: String(raw.id ?? raw.post_id ?? raw.message_id ?? `tmp-${Date.now()}-${Math.random()}`),
    channel_id: raw.channel_id ?? channelId,
    sender_id: String(raw.sender_id ?? raw.from ?? ""),
    sender_name: raw.sender_name ?? raw.username ?? raw.admin_name ?? null,
    message: raw.message ?? raw.text ?? null,
    file: extractFile(raw),
    created_at: raw.created_at || raw.time || new Date().toISOString(),
    status:
      raw.status ??
      raw.action_status ??
      raw.approval_status ??
      raw.clean_data_status ??
      null,
  };
}
