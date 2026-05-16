// Centralized API base URL configuration.
// All HTTP/WS endpoints should derive from these constants so the host
// can be changed in one place.

export const API_BASE = "https://ngrchatbot.whindia.in";
export const WS_BASE = "wss://ngrchatbot.whindia.in";

export const API_ENDPOINTS = {
  login: `${API_BASE}/chat/login/`,
  register: `${API_BASE}/chat/register/`,
  uploadFile: `${API_BASE}/chat/upload_file/`,
  mediaFile: (id: string | number) => `${API_BASE}/chat/media-file/${id}/`,
  chatMessages: (chatId: string) => `${API_BASE}/chat/get_chat_messages/?chat_id=${chatId}`,
};