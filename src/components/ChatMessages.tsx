import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";

interface ChatMessage {
  sender_id: string;
  message: string;
  created_at: string;
}

interface ChatMessagesProps {
  chatId: string | number | null;
  currentUserId: string | number;
  selectedUsername: string;
  localMessages: { id: string; text: string; sender: "me" | "other" }[];
}

const API_BASE = "https://ngrchatbot.whindia.in";

export default function ChatMessages({
  chatId,
  currentUserId,
  selectedUsername,
  localMessages,
}: ChatMessagesProps) {
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) {
      setApiMessages([]);
      return;
    }
    fetchMessages();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [apiMessages, localMessages]);

  const fetchMessages = async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/chat/get_chat_messages/?chat_id=${chatId}`
      );
      const data = await res.json();
      const msgs = Array.isArray(data)
        ? data
        : data.data || data.messages || data.results || [];
      setApiMessages(msgs);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  };

  const allEmpty = apiMessages.length === 0 && localMessages.length === 0;

  return (
    <ScrollArea className="flex-1 bg-muted/30">
      <div className="p-4 md:p-6 space-y-3 min-h-full flex flex-col justify-end">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && allEmpty && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">
                Start a conversation with{" "}
                <span className="font-medium text-foreground">
                  {selectedUsername}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* API-loaded messages */}
        {apiMessages.map((msg, idx) => {
          const isMe = String(msg.sender_id) === String(currentUserId);
          return (
            <div
              key={`api-${idx}`}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? "bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}
              >
                <p className="break-words">{msg.message}</p>
              </div>
            </div>
          );
        })}

        {/* Locally added messages (sent/received via WebSocket) */}
        {localMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.sender === "me"
                  ? "bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              }`}
            >
              <p className="break-words">{msg.text}</p>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
