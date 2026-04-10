import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";
import MessageContextMenu from "@/components/MessageContextMenu";
import { toast } from "sonner";

export interface UnifiedMessage {
  key: string;
  id?: string;
  isMe: boolean;
  text: string;
  time: string;
  dateSource: string | undefined;
  deleted?: boolean;
  reply_to?: { text: string; sender: string } | null;
}

interface ChatMessage {
  sender_id: string;
  message: string;
  created_at?: string;
  time?: string;
  id?: string;
  deleted?: boolean;
  reply_to?: { text: string; sender: string } | null;
}

interface ChatMessagesProps {
  chatId: string | number | null;
  currentUserId: string | number;
  selectedUsername: string;
  localMessages: {
    id: string;
    text: string;
    sender: "me" | "other";
    time?: string;
    deleted?: boolean;
    reply_to?: { text: string; sender: string } | null;
  }[];
  onReply?: (msg: { id: string; text: string; isMe: boolean }) => void;
  onForward?: (msg: { text: string }) => void;
  onDelete?: (msg: { id: string; isMe: boolean; deleteType: "me" | "everyone" }) => void;
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
  onReply,
  onForward,
  onDelete,
}: ChatMessagesProps) {
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    msg: UnifiedMessage;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UnifiedMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!chatId) { setApiMessages([]); return; }
    fetchMessages();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [apiMessages, localMessages]);

  const fetchMessages = async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat/get_chat_messages/?chat_id=${chatId}`);
      const data = await res.json();
      const msgs = Array.isArray(data) ? data : data.data || data.messages || data.results || [];
      setApiMessages(msgs);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  };

  const unified: UnifiedMessage[] = [];

  apiMessages.forEach((msg, idx) => {
    unified.push({
      key: msg.id || `api-${idx}`,
      id: msg.id || "",
      isMe: String(msg.sender_id) === String(currentUserId),
      text: msg.deleted ? "This message was deleted" : msg.message,
      time: formatTime(msg.created_at) || msg.time || "",
      dateSource: msg.created_at || msg.time,
      deleted: msg.deleted,
      reply_to: msg.reply_to,
    });
  });

  localMessages.forEach((msg) => {
    unified.push({
      key: msg.id,
      id: msg.id,
      isMe: msg.sender === "me",
      text: msg.deleted ? "This message was deleted" : msg.text,
      time: msg.time || "",
      dateSource: msg.time,
      deleted: msg.deleted,
      reply_to: msg.reply_to,
    });
  });

  const allEmpty = unified.length === 0;

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: UnifiedMessage) => {
    if (msg.deleted) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: UnifiedMessage) => {
    if (msg.deleted) return;
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ x: touch.clientX, y: touch.clientY, msg });
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }, []);

  // Render messages
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
      <div
        key={m.key}
        className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}
        onContextMenu={(e) => handleContextMenu(e, m)}
        onTouchStart={(e) => handleTouchStart(e, m)}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
      >
        <div
          className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed select-none ${
            m.deleted
              ? "bg-muted/50 text-muted-foreground italic"
              : m.isMe
                ? "bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
          }`}
        >
          {/* Reply quote */}
          {m.reply_to && !m.deleted && (
            <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 text-xs ${
              m.isMe
                ? "bg-white/15 border-white/40 text-white/80"
                : "bg-background/60 border-primary/40 text-muted-foreground"
            }`}>
              <p className="font-medium text-[10px] mb-0.5">{m.reply_to.sender}</p>
              <p className="line-clamp-2">{m.reply_to.text}</p>
            </div>
          )}
          <p className="break-words">{m.text}</p>
          {m.time && !m.deleted && (
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
                <span className="font-medium text-foreground">{selectedUsername}</span>
              </p>
            </div>
          </div>
        )}

        {rendered}
        <div ref={messagesEndRef} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMe={contextMenu.msg.isMe}
          onReply={() => {
            if (onReply && contextMenu.msg.id) {
              onReply({ id: contextMenu.msg.id, text: contextMenu.msg.text, isMe: contextMenu.msg.isMe });
            }
            setContextMenu(null);
          }}
          onForward={() => {
            if (onForward) onForward({ text: contextMenu.msg.text });
            setContextMenu(null);
          }}
          onCopy={() => {
            handleCopy(contextMenu.msg.text);
            setContextMenu(null);
          }}
          onDelete={() => {
            setDeleteConfirm(contextMenu.msg);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900 mb-4">Delete Message?</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (onDelete && deleteConfirm.id) onDelete({ id: deleteConfirm.id, isMe: deleteConfirm.isMe, deleteType: "me" });
                  setDeleteConfirm(null);
                }}
                className="w-full py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Delete for Me
              </button>
              {deleteConfirm.isMe && (
                <button
                  onClick={() => {
                    if (onDelete && deleteConfirm.id) onDelete({ id: deleteConfirm.id, isMe: deleteConfirm.isMe, deleteType: "everyone" });
                    setDeleteConfirm(null);
                  }}
                  className="w-full py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                >
                  Delete for Everyone
                </button>
              )}
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-2.5 text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ScrollArea>
  );
}
