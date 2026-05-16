// API helpers for channel membership.
// Thin wrappers over fetch that normalize backend responses
// and surface a clean error message to the caller.

import { CHANNEL_ENDPOINTS } from "./channelConfig";
import type { ChannelMember, ChannelMemberRole } from "./channelTypes";
import { apiFetch } from "./auth";

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* allow empty body */
  }
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

function normalizeRole(raw: any): ChannelMemberRole {
  const r = String(raw || "").toLowerCase();
  return r === "admin" ? "admin" : "member";
}

export function mapToChannelMember(raw: any): ChannelMember {
  return {
    user_id: raw.user_id ?? raw.id ?? raw.userId ?? "",
    username: raw.username ?? raw.name ?? raw.user_name ?? "Unknown",
    role: normalizeRole(raw.role ?? raw.user_role),
    joined_at: raw.joined_at ?? raw.created_at,
  };
}

export async function fetchChannelMembers(
  channelId: string | number,
): Promise<ChannelMember[]> {
  const res = await apiFetch(`${CHANNEL_ENDPOINTS.members}?channel_id=${channelId}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || json?.error || `Failed (${res.status})`);
  }
  const arr = Array.isArray(json) ? json : json.data || json.members || [];
  return arr.map(mapToChannelMember);
}

export async function addUserToChannel(params: {
  channelId: string | number;
  userId: string | number;
  adminId: string | number;
  role?: ChannelMemberRole;
}) {
  return postJson(CHANNEL_ENDPOINTS.addMember, {
    channel_id: params.channelId,
    user_id: params.userId,
    admin_id: params.adminId,
    role: params.role || "member",
  });
}

export async function joinChannel(params: {
  channelId: string | number;
  userId: string | number;
}) {
  return postJson(CHANNEL_ENDPOINTS.joinChannel, {
    channel_id: params.channelId,
    user_id: params.userId,
  });
}
