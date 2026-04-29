// Type definitions for the Telegram-style Channel feature.
// Kept separate from direct-chat types to avoid coupling.

import type { ChatAttachment } from "./chatMessage";

export interface Channel {
  id: string | number;
  name: string;
  description?: string | null;
  admin_id?: string | number;
  admin_name?: string | null;
  created_at?: string;
  members_count?: number;
  is_admin?: boolean;
  // Telegram-style chat-list metadata
  unread_count?: number;
  last_message?: string | null;
  last_message_time?: string | null;
}

export interface ChannelPost {
  id: string;
  channel_id: string | number;
  sender_id: string | number;
  sender_name?: string | null;
  message: string | null;
  file?: ChatAttachment | null;
  created_at: string;
  // UI-only
  uploading?: boolean;
  upload_error?: string | null;
}

export type ChannelMemberRole = "admin" | "member";

export interface ChannelMember {
  user_id: string | number;
  username: string;
  role: ChannelMemberRole;
  joined_at?: string;
}
