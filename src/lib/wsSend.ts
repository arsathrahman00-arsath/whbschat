// Thin wrapper around the chat WebSocket. Keeps payload shape in one place.

export interface SendChatMessageArgs {
  senderId: string | number;
  receiverId: string | number;
  text?: string | null;
  fileId?: string | null;
  replyToId?: string | null;
}

export function sendChatMessage(
  ws: WebSocket | null,
  { senderId, receiverId, text, fileId, replyToId }: SendChatMessageArgs,
): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (!text && !fileId) return false;

  const payload: Record<string, unknown> = {
    type: "chat_message",
    sender_id: senderId,
    receiver_id: receiverId,
  };
  if (text) payload.message = text;
  if (fileId) payload.file_id = fileId;
  if (replyToId) payload.reply_to = replyToId;

  ws.send(JSON.stringify(payload));
  return true;
}
