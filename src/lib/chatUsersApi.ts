// Helper for fetching the global chat users list. Used by the channel
// "Add member" picker so admins can select a user instead of typing an id.

import { CHANNEL_ENDPOINTS } from "./channelConfig";

export interface ChatUserLite {
  id: string | number;
  username: string;
  user_code?: string;
}

export async function fetchChatUsers(): Promise<ChatUserLite[]> {
  const res = await fetch(CHANNEL_ENDPOINTS.users);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data && (data.message || data.error)) || `Failed to load users (${res.status})`,
    );
  }
  const raw = Array.isArray(data) ? data : data?.data || data?.users || data?.results || [];
  return raw.map((u: any) => ({
    id: u.id ?? u.user_id,
    username: u.user_name || u.username || u.name || `User ${u.id ?? u.user_id}`,
    user_code: u.user_code,
  }));
}
