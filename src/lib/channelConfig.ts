// Shared config for channel feature. Keeps URLs in one place so we don't
// hardcode them across components.

export const HTTP_BASE = "https://ngrchatbot.whindia.in";
export const WS_CHANNEL_BASE = "wss://ngrchatbot.whindia.in/ws/channel";
export const WS_USER_BASE = "wss://ngrchatbot.whindia.in/ws/chat";

export const CHANNEL_ENDPOINTS = {
  create: `${HTTP_BASE}/chat/create_channel/`,
  list: `${HTTP_BASE}/chat/get_channels/`,
  posts: `${HTTP_BASE}/chat/get_channel_posts/`,
  upload: `${HTTP_BASE}/chat/upload_file/`,
  addMember: `${HTTP_BASE}/chat/add_user_to_channel/`,
  joinChannel: `${HTTP_BASE}/chat/join_channel/`,
  members: `${HTTP_BASE}/chat/get_channel_members/`,
  users: `${HTTP_BASE}/chat/get_users/`,
  approveCleanData: `${HTTP_BASE}/chat/approve_clean_data/`,
  markChannelRead: `${HTTP_BASE}/chat/mark_channel_read/`,
};

export function channelWsUrl(channelId: string | number): string {
  return `${WS_CHANNEL_BASE}/${channelId}/`;
}

export function userWsUrl(userId: string | number): string {
  return `${WS_USER_BASE}/${userId}/`;
}
