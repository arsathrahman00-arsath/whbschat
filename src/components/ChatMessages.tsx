import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";

interface ChatMessage {
  sender_id: string;
  message: string;
  created_at?: string;
  time?: string;
}

interface ChatMessagesProps {
  chatId: string | number | null;
  currentUserId: string | number;
  selectedUsername: string;
  localMessages: { id: string; text: string; sender: "me" | "other"; time?: string }[];
}

const API_BASE = "https://ngrchatbot.whindia.in";

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return dateStr;
  }
}

function getDateOnly(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  } catch {
    return null;
  }
}

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  );
}

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

  // Build unified message list
  const allMessages: { type: "api"; msg: ChatMessage; idx: number }[] | { type: "local"; msg: typeof localMessages[0] }[] = [];
  const unified: Array<{
    key: string;
    isMe: boolean;
    text: string;
    time: string;
    dateSource: string | undefined;
  }> = [];

  apiMessages.forEach((msg, idx) => {
    unified.push({
      key: `api-${idx}`,
      isMe: String(msg.sender_id) === String(currentUserId),
      text: msg.message,
      time: formatTime(msg.created_at) || msg.time || "",
      dateSource: msg.created_at || msg.time,
    });
  });

  localMessages.forEach((msg) => {
    unified.push({
      key: msg.id,
      isMe: msg.sender === "me",
      text: msg.text,
      time: msg.time || "",
      dateSource: msg.time,
    });
  });

  const allEmpty = unified.length === 0;

  // Render with date separators
  let lastDateKey: string | null = null;
  const rendered: React.ReactNode[] = [];

  unified.forEach((m) => {
    const dateKey = getDateOnly(m.dateSource);
    if (dateKey && dateKey !== lastDateKey) {
      const label = formatDateLabel(m.dateSource);
      if (label) rendered.push(<DateSeparator key={`sep-${dateKey}`} label={label} />);
      lastDateKey = dateKey;
    }
    rendered.push(
      <div key={m.key} className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            m.isMe
              ? "bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
          }`}
        >
          <p className="break-words">{m.text}</p>
          {m.time && (
            <p className={`text-[10px] mt-1 text-right ${m.isMe ? "text-white/60" : "text-muted-foreground/60"}`}>
              {m.time}
            </p>
          )}
        </div>
      </div>
    );
  });

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

        {rendered}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}