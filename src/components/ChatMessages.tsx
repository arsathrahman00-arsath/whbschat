import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle } from "lucide-react";
import MessageContextMenu from "@/components/MessageContextMenu";
import Attachment from "@/components/Attachment";
import { mapToChatMessage, type ChatMessage } from "@/lib/chatMessage";
import HtmlMessage, { looksLikeHtml } from "@/components/HtmlMessage";
import { toast } from "sonner";

interface ChatMessagesProps {
  chatId: string | number | null;
  currentUserId: string | number;
  selectedUsername: string;
  /** Already-normalized live messages (optimistic + WS) for this conversation. */
  localMessages: ChatMessage[];
  onReply?: (msg: { id: string; text: string; isMe: boolean }) => void;
  onForward?: (msg: { id: string; text: string; file: ChatMessage["file"] }) => void;
  onDelete?: (msg: { id: string; isMe: boolean; deleteType: "me" | "everyone" }) => void;
}

const API_BASE = "https://ngrchatbot.whindia.in";

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

function getDateOnly(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

function toProperCase(str?: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) => (part.trim().length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground shadow-sm">{label}</span>
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: ChatMessage } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!chatId) {
      setApiMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/chat/get_chat_messages/?chat_id=${chatId}&user_id=${currentUserId}`);
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : data.data || data.messages || data.results || [];
        if (cancelled) return;
        const filtered = msgs.filter((m: any) => !m?.cb_message_deleted && !m?.deleted_for_me);
        setApiMessages(filtered.map((m: any) => mapToChatMessage(m, currentUserId)));
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [apiMessages, localMessages]);

  // Merge: API first, then local — local wins on duplicate id, but we
  // preserve `file` and `reply_to` from whichever copy has them (server
  // broadcasts sometimes omit them) and keep `uploading`/`upload_error`
  // from the local optimistic copy until the server message lands.
  const merged: ChatMessage[] = (() => {
    const map = new Map<string, ChatMessage>();
    apiMessages.forEach((m) => map.set(m.id, m));
    localMessages.forEach((m) => {
      const existing = map.get(m.id);
      if (!existing) {
        map.set(m.id, m);
        return;
      }
      map.set(m.id, {
        ...existing,
        ...m,
        file: m.file ?? existing.file ?? null,
        reply_to: m.reply_to ?? existing.reply_to ?? null,
        uploading: m.uploading ?? false,
        upload_error: m.upload_error ?? null,
      });
    });
    // return Array.from(map.values()).sort(
    //   (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    // );
    return Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();

      if (ta !== tb) return ta - tb;

      return String(a.id).localeCompare(String(b.id));
    });
  })();

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.deleted) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: ChatMessage) => {
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

  let lastDateKey: string | null = null;
  const rendered: React.ReactNode[] = [];

  merged.forEach((m, idx) => {
    const isMe = String(m.sender_id) === String(currentUserId);
    const dateKey = getDateOnly(m.created_at);
    if (dateKey && dateKey !== lastDateKey) {
      const label = formatDateLabel(m.created_at);
      if (label) rendered.push(<DateSeparator key={`sep-${dateKey}-${idx}`} label={label} />);
      lastDateKey = dateKey;
    }

    const prevMsg = idx > 0 ? merged[idx - 1] : null;
    const nextMsg = idx < merged.length - 1 ? merged[idx + 1] : null;
    const prevIsMe = prevMsg ? String(prevMsg.sender_id) === String(currentUserId) : null;
    const nextIsMe = nextMsg ? String(nextMsg.sender_id) === String(currentUserId) : null;
    const sameSenderAsPrev = prevMsg && prevIsMe === isMe && getDateOnly(prevMsg.created_at) === dateKey;
    const sameSenderAsNext = nextMsg && nextIsMe === isMe && getDateOnly(nextMsg.created_at) === dateKey;

    const spacingClass = sameSenderAsPrev ? "mt-[3px]" : "mt-[10px]";

    const getBubbleRadius = () => {
      if (isMe) {
        const topRight = sameSenderAsPrev ? "rounded-tr-md" : "rounded-tr-2xl";
        const bottomRight = sameSenderAsNext ? "rounded-br-md" : "rounded-br-md";
        return `rounded-tl-2xl ${topRight} rounded-bl-2xl ${bottomRight}`;
      }
      const topLeft = sameSenderAsPrev ? "rounded-tl-md" : "rounded-tl-2xl";
      const bottomLeft = sameSenderAsNext ? "rounded-bl-md" : "rounded-bl-md";
      return `${topLeft} rounded-tr-2xl ${bottomLeft} rounded-br-2xl`;
    };

    const hasFile = !m.deleted && !!m.file;
    const text = m.deleted ? "This message was deleted" : m.message || "";
    const hasText = text.trim().length > 0;
    const hasCaption = hasFile && hasText;

    rendered.push(
      <div
        key={m.id}
        className={`flex ${isMe ? "justify-end" : "justify-start"} ${idx === 0 ? "" : spacingClass}`}
        onContextMenu={(e) => handleContextMenu(e, m)}
        onTouchStart={(e) => handleTouchStart(e, m)}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
      >
        <div
          className={`max-w-[65%] text-[14px] leading-[1.35] select-none overflow-hidden ${getBubbleRadius()} ${
            hasFile ? "p-[3px]" : "px-3 py-[6px]"
          } ${
            m.deleted
              ? "bg-muted/50 text-muted-foreground italic px-3 py-[6px]"
              : isMe
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground shadow-sm"
          }`}
        >
          {m.reply_to && !m.deleted && (
            <div
              className={`mb-[5px] rounded-[4px] border-l-[3px] cursor-pointer overflow-hidden ${
                hasFile ? "mx-[3px] mt-[3px]" : ""
              } ${isMe ? "bg-[#ffffff1a] border-white/60" : "bg-[#3390ec0d] border-[#3390ec]"}`}
            >
              <div className="px-[7px] py-[4px]">
                <p className={`text-[12px] font-semibold leading-tight ${isMe ? "text-white" : "text-[#3390ec]"}`}>
                  {toProperCase(m.reply_to.sender)}
                </p>
                <p
                  className={`text-[12px] leading-tight line-clamp-1 mt-[1px] ${
                    isMe ? "text-white/70" : "text-[#000000]/50"
                  }`}
                >
                  {m.reply_to.text}
                </p>
              </div>
            </div>
          )}

          {hasFile && m.file && (
            <Attachment file={m.file} isMe={isMe} uploading={m.uploading} uploadError={m.upload_error} />
          )}

          {(!hasFile || hasCaption) &&
            !m.deleted &&
            hasText &&
            (looksLikeHtml(text) ? (
              <div className={hasFile ? "block px-[9px] py-[6px]" : ""}>
                <HtmlMessage html={text} isMe={isMe} messageId={m.id} />
              </div>
            ) : (
              <span className={`break-words whitespace-pre-wrap ${hasFile ? "block px-[9px] py-[6px]" : ""}`}>
                {text}
              </span>
            ))}
          {m.deleted && <span className="break-words whitespace-pre-wrap">{text}</span>}

          {!m.deleted && (
            <span
              className={`text-[11px] float-right leading-[1.6] ${
                hasFile && !hasCaption ? "px-[9px] pb-[4px] mt-0" : "mt-[2px] ml-3"
              } ${isMe ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}
            >
              {formatTime(m.created_at)}
            </span>
          )}
        </div>
      </div>,
    );
  });

  return (
    <ScrollArea className="flex-1 bg-secondary/50">
      <div className="px-4 md:px-[15%] py-3 min-h-full flex flex-col justify-end">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && merged.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">
                Start a conversation with <span className="font-medium text-foreground">{selectedUsername}</span>
              </p>
            </div>
          </div>
        )}
        {rendered}
        <div ref={messagesEndRef} />
      </div>

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMe={String(contextMenu.msg.sender_id) === String(currentUserId)}
          onReply={() => {
            if (onReply && contextMenu.msg.id) {
              const isMe = String(contextMenu.msg.sender_id) === String(currentUserId);
              onReply({
                id: contextMenu.msg.id,
                text: contextMenu.msg.message || (contextMenu.msg.file ? contextMenu.msg.file.name : ""),
                isMe,
              });
            }
            setContextMenu(null);
          }}
          onForward={() => {
            if (onForward)
              onForward({
                id: contextMenu.msg.id,
                text: contextMenu.msg.message || "",
                file: contextMenu.msg.file || null,
              });
            setContextMenu(null);
          }}
          onCopy={() => {
            handleCopy(contextMenu.msg.message || "");
            setContextMenu(null);
          }}
          onDelete={() => {
            setDeleteConfirm(contextMenu.msg);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-foreground/40"
          onClick={() => setDeleteConfirm(null)}
        >
          <div className="bg-card rounded-2xl p-5 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground mb-4">Delete Message?</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (onDelete && deleteConfirm.id) {
                    onDelete({
                      id: deleteConfirm.id,
                      isMe: String(deleteConfirm.sender_id) === String(currentUserId),
                      deleteType: "me",
                    });
                  }
                  setDeleteConfirm(null);
                }}
                className="w-full py-2.5 text-sm text-foreground hover:bg-muted rounded-xl transition-colors"
              >
                Delete for me
              </button>
              {String(deleteConfirm.sender_id) === String(currentUserId) && (
                <button
                  onClick={() => {
                    if (onDelete && deleteConfirm.id) {
                      onDelete({
                        id: deleteConfirm.id,
                        isMe: true,
                        deleteType: "everyone",
                      });
                    }
                    setDeleteConfirm(null);
                  }}
                  className="w-full py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                >
                  Delete for everyone
                </button>
              )}
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-2.5 text-sm text-muted-foreground hover:bg-muted rounded-xl transition-colors"
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
