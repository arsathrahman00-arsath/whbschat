import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, LogOut, Search, MessageCircle, WifiOff, X, Smile, Paperclip, FileText, Film } from "lucide-react";
import logo from "@/assets/logo.jpg";
import channelIcon from "@/assets/channel-icon.jpg";
import ChatMessages from "@/components/ChatMessages";
import ForwardModal from "@/components/ForwardModal";
import { generateChatId } from "@/lib/chatId";
import {
  mapToChatMessage,
  formatFileSize,
  kindFromMime,
  type ChatMessage,
  type ChatAttachment,
} from "@/lib/chatMessage";
import { uploadAttachment } from "@/lib/uploadAttachment";
import { sendChatMessage } from "@/lib/wsSend";
import { toast } from "sonner";

interface ChatUser {
  id: number | string;
  username: string;
  user_code?: number;
}

interface ChatMeta {
  lastActivity: number; // ms epoch — used purely for sidebar sort
  lastPreview: string; // text preview of last message ("📎 file.png" for files)
  unread: number;
}

function previewFromMessage(text: string | null | undefined, fileName?: string | null): string {
  const t = (text || "").trim();
  if (t) {
    // Strip HTML tags for sidebar preview only
    const stripped = t
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped || (fileName ? `📎 ${fileName}` : "");
  }
  if (fileName) return `📎 ${fileName}`;
  return "";
}

function formatChatTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - day.getTime();
  if (diff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  if (diff === 86400000) return "Yesterday";
  if (diff < 7 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

interface UserStatusInfo {
  status: "Active" | "Offline";
  last_seen: string | null;
}

interface ReplyTo {
  id: string;
  text: string;
  isMe: boolean;
}

const WS_BASE_URL = "wss://ngrchatbot.whindia.in/ws/chat";

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "from-[#1E90FF] to-[#22C55E]",
    "from-[#F97316] to-[#EC4899]",
    "from-[#8B5CF6] to-[#1E90FF]",
    "from-[#22C55E] to-[#F97316]",
    "from-[#EC4899] to-[#8B5CF6]",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Offline";
  try {
    const d = new Date(lastSeen.replace(" ", "T"));
    if (isNaN(d.getTime())) return "Offline";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const seenDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = today.getTime() - seenDay.getTime();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    if (diff === 0) return `Last seen at ${time}`;
    if (diff === 86400000) return "Last seen yesterday";
    return `Last seen ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  } catch {
    return "Offline";
  }
}

function formatStatusDisplay(info: UserStatusInfo | undefined): { text: string; isActive: boolean } {
  if (!info) return { text: "", isActive: false };
  if (info.status === "Active") return { text: "Active", isActive: true };
  return { text: formatLastSeen(info.last_seen), isActive: false };
}

export default function Chat() {
  const navigate = useNavigate();
  const [users, setUsersState] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  // Conversation key = peer userId (string). Stored as ChatMessage[] (live + optimistic).
  const [messagesByUser, setMessagesByUser] = useState<Record<string, ChatMessage[]>>({});
  const [deletedMessagesById, setDeletedMessagesById] = useState<Record<string, "me" | "everyone">>({});
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatusInfo>>({});
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [chatId, setChatId] = useState<string | number | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [forwardMsg, setForwardMsg] = useState<{ id: string; text: string; file: ChatAttachment | null } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const usersRef = useRef<ChatUser[]>([]);
  const messagesByUserRef = useRef<Record<string, ChatMessage[]>>({});
  const selectedUserRef = useRef<ChatUser | null>(null);

  const setUsers = useCallback((list: ChatUser[]) => {
    usersRef.current = list;
    setUsersState(list);
  }, []);

  const session = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("whchat_session") || "null");
    } catch {
      return null;
    }
  })();

  const currentUserId = session?.userId || session?.id;

  const [chatMetaByUser, setChatMetaByUser] = useState<Record<string, ChatMeta>>({});

  const bumpMeta = useCallback(
    (peerId: string | number, opts: { preview?: string; ts?: number; incrementUnread?: boolean }) => {
      const key = String(peerId);
      const ts = opts.ts ?? Date.now();
      setChatMetaByUser((prev) => {
        const cur = prev[key] || { lastActivity: 0, lastPreview: "", unread: 0 };
        return {
          ...prev,
          [key]: {
            lastActivity: Math.max(cur.lastActivity, ts),
            lastPreview: opts.preview ?? cur.lastPreview,
            unread: opts.incrementUnread ? cur.unread + 1 : cur.unread,
          },
        };
      });
    },
    [],
  );

  const clearUnread = useCallback((peerId: string | number) => {
    const key = String(peerId);
    setChatMetaByUser((prev) => {
      const cur = prev[key];
      if (!cur || cur.unread === 0) return prev;
      return { ...prev, [key]: { ...cur, unread: 0 } };
    });
  }, []);

  useEffect(() => {
    messagesByUserRef.current = messagesByUser;
  }, [messagesByUser]);
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Auto-focus the message input when a chat is opened or a reply is selected.
  useEffect(() => {
    if (selectedUser) {
      messageInputRef.current?.focus();
    }
  }, [selectedUser]);
  useEffect(() => {
    if (replyTo) {
      messageInputRef.current?.focus();
    }
  }, [replyTo]);

  const messages = selectedUser ? messagesByUser[String(selectedUser.id)] || [] : [];

  /** Append a normalized message to a conversation, dedup by id. */
  const appendMessage = useCallback((peerId: string | number, msg: ChatMessage) => {
    setMessagesByUser((prev) => {
      const key = String(peerId);
      const existing = prev[key] || [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [key]: [...existing, msg] };
    });
  }, []);

  /** Patch an existing message (e.g. swap temp id → real id). */
  const patchMessage = useCallback((peerId: string | number, msgId: string, patch: Partial<ChatMessage>) => {
    setMessagesByUser((prev) => {
      const key = String(peerId);
      const list = prev[key];
      if (!list) return prev;
      return { ...prev, [key]: list.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) };
    });
  }, []);

  const removeMessage = useCallback((peerId: string | number, msgId: string) => {
    setMessagesByUser((prev) => {
      const key = String(peerId);
      const list = prev[key];
      if (!list) return prev;
      return { ...prev, [key]: list.filter((m) => m.id !== msgId) };
    });
  }, []);

  const applyDeletedMessage = useCallback((messageId: string | number, deleteType: "me" | "everyone") => {
    const deletedId = String(messageId);
    setDeletedMessagesById((prev) => ({ ...prev, [deletedId]: deleteType }));
    setMessagesByUser((prev) => {
      let changed = false;
      const updated: Record<string, ChatMessage[]> = {};

      for (const key of Object.keys(prev)) {
        const list = prev[key] || [];
        if (!list.some((m) => m.id === deletedId)) {
          updated[key] = list;
          continue;
        }

        if (deleteType === "me") {
          updated[key] = list.filter((m) => m.id !== deletedId);
          changed = true;
          continue;
        }

        updated[key] = list.map((m) =>
          m.id === deletedId
            ? { ...m, deleted: true, message: "This message was deleted", file: null, reply_to: null, uploading: false, upload_error: null }
            : m,
        );
        changed = true;
      }

      return changed ? updated : prev;
    });

    if (deleteType === "everyone") {
      setChatMetaByUser((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(messagesByUserRef.current)) {
          if (messagesByUserRef.current[key]?.some((m) => m.id === deletedId) && next[key]) {
            next[key] = { ...next[key], lastPreview: "This message was deleted" };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!currentUserId) return;
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`${WS_BASE_URL}/${currentUserId}/`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "user_status", status: "Active" }));
      const selUser = selectedUserRef.current;
      if (selUser) ws.send(JSON.stringify({ type: "get_status", target_user_id: selUser.id }));
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
      }, 5000);
      ws.addEventListener("close", () => clearInterval(heartbeat));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Debug: surface every WS frame so we can see what the backend sends.
        // eslint-disable-next-line no-console
        console.log("[WS] received", data);

        if (data.type === "user_status") {
          setUserStatuses((prev) => ({
            ...prev,
            [String(data.user_id)]: {
              status: data.status === "Active" ? "Active" : "Offline",
              last_seen: data.last_seen || null,
            },
          }));
          return;
        }

        // Backend-ready hook: server may push authoritative unread/preview updates.
        if (data.type === "unread_update" && data.user_id != null) {
          const peerKey = String(data.user_id);
          setChatMetaByUser((prev) => {
            const cur = prev[peerKey] || { lastActivity: 0, lastPreview: "", unread: 0 };
            return {
              ...prev,
              [peerKey]: {
                lastActivity: data.last_message_time
                  ? new Date(data.last_message_time).getTime() || cur.lastActivity
                  : cur.lastActivity,
                lastPreview: typeof data.last_message === "string" ? data.last_message : cur.lastPreview,
                unread: typeof data.unread_count === "number" ? data.unread_count : cur.unread,
              },
            };
          });
          return;
        }

        if (data.type === "message_deleted") {
          console.log("Delete event received", data);
          const deleteType: "me" | "everyone" = data.delete_type === "me" ? "me" : "everyone";
          applyDeletedMessage(data.message_id, deleteType);
          return;
        }

        // Accept the canonical "chat_message" plus a few common backend
        // variants. Also accept any payload that has both sender_id and
        // (message OR file) — that's a chat message regardless of the label.
        const looksLikeChatMessage =
          data.type === "chat_message" ||
          data.type === "new_message" ||
          data.type === "message" ||
          (data.sender_id != null && (data.message != null || data.file != null || data.file_id != null));

        if (!looksLikeChatMessage) {
          console.log("[WS] ignored frame (unknown type)", data.type);
          return;
        }

        const senderId = String(data.sender_id);
        const receiverId = String(data.receiver_id ?? "");
        const isFromMe = senderId === String(currentUserId);
        // Conversation key is the peer (the other user)
        const peerKey = isFromMe ? receiverId : senderId;

        const incoming = mapToChatMessage(data, currentUserId);
        console.log("[WS] chat_message", { isFromMe, peerKey, incoming });

        const previewText = previewFromMessage(incoming.message, incoming.file?.name);
        const ts = new Date(incoming.created_at).getTime() || Date.now();

        if (isFromMe) {
          setMessagesByUser((prev) => {
            const list = prev[peerKey] || [];
            if (list.some((m) => m.id === incoming.id)) return prev;
            const tmpIdx = [...list].reverse().findIndex((m) => m.id.startsWith("tmp-"));
            if (tmpIdx !== -1) {
              const realIdx = list.length - 1 - tmpIdx;
              const next = [...list];
              next[realIdx] = {
                ...next[realIdx],
                ...incoming,
                created_at: next[realIdx].created_at || incoming.created_at,
                file: incoming.file ?? next[realIdx].file ?? null,
                reply_to: incoming.reply_to ?? next[realIdx].reply_to ?? null,
                uploading: false,
                upload_error: null,
              };
              return { ...prev, [peerKey]: next };
            }
            return { ...prev, [peerKey]: [...list, incoming] };
          });
          // Sender side: update preview/activity, never bump unread
          if (peerKey) bumpMeta(peerKey, { preview: previewText, ts });
          return;
        }

        // Incoming from peer
        const senderName =
          data.sender_name || usersRef.current.find((u) => String(u.id) === senderId)?.username || "User";

        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          const body = incoming.message || (incoming.file ? `📎 ${incoming.file.name}` : "");
          const n = new Notification(senderName, { body, icon: "/logo.png" });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }

        appendMessage(peerKey, incoming);

        // Only increment unread when the chat is not actively focused
        const activePeerId = selectedUserRef.current ? String(selectedUserRef.current.id) : null;
        const isViewingThisChat = activePeerId === peerKey && !document.hidden;
        bumpMeta(peerKey, {
          preview: previewText,
          ts,
          incrementUnread: !isViewingThisChat,
        });
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
  }, [currentUserId, appendMessage, bumpMeta, applyDeletedMessage]);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }
    fetchUsers();
    connectWebSocket();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectUser = (user: ChatUser) => {
    setSelectedUser(user);
    setSidebarOpen(false);
    setChatId(generateChatId(currentUserId, user.id));
    // Reset unread immediately on open
    clearUnread(user.id);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "get_status", target_user_id: user.id }));
      // Backend-ready hook: tell server this chat has been read.
      wsRef.current.send(
        JSON.stringify({
          type: "mark_as_read",
          chat_id: generateChatId(currentUserId, user.id),
          user_id: currentUserId,
          peer_id: user.id,
        }),
      );
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("https://ngrchatbot.whindia.in/chat/get_users/");
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data.data || data.users || data.results || [];
      let userList: ChatUser[] = rawList.map((u: any) => ({
        id: u.id,
        username: u.user_name || u.username || u.name || `User ${u.id}`,
        user_code: u.user_code,
      }));
      if (currentUserId) userList = userList.filter((u) => String(u.id) !== String(currentUserId));
      if (session?.username)
        userList = userList.filter((u) => u.username.toLowerCase() !== session.username.toLowerCase());
      setUsers(userList);

      // Backend-ready: seed unread/preview/last_message_time if API provides them.
      const seeded: Record<string, ChatMeta> = {};
      for (const u of rawList) {
        const key = String(u.id);
        if (!key) continue;
        const ts = u.last_message_time
          ? new Date(u.last_message_time).getTime() || 0
          : u.last_message_at
            ? new Date(u.last_message_at).getTime() || 0
            : 0;
        const preview =
          (typeof u.last_message === "string" && u.last_message) ||
          (typeof u.last_message_text === "string" && u.last_message_text) ||
          "";
        const unread = Number(u.unread_count ?? u.unread ?? 0) || 0;
        if (ts || preview || unread) {
          seeded[key] = { lastActivity: ts, lastPreview: preview, unread };
        }
      }
      if (Object.keys(seeded).length) {
        setChatMetaByUser((prev) => ({ ...seeded, ...prev }));
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  /**
   * Send flow:
   *   1. If a file is staged, upload it first → get { file_id, url, ... }
   *   2. Then send a single WebSocket chat_message with { sender_id, receiver_id, message, file_id }
   * Optimistic UI: a tmp message is inserted immediately, then reconciled
   * with the server's broadcast via file.id (or text).
   */
  const handleSend = async () => {
    if (!selectedUser) return;
    const text = input.trim();
    const file = previewFile;

    if (!text && !file) return;
    if (isUploading) return;

    const peerId = selectedUser.id;
    const peerKey = String(peerId);
    const replySnapshot = replyTo;
    const tmpId = `tmp-${Date.now()}`;
    const localUrl = file ? URL.createObjectURL(file) : null;

    // Build optimistic ChatMessage
    const optimistic: ChatMessage = {
      id: tmpId,
      sender_id: String(currentUserId),
      receiver_id: String(peerId),
      message: text || null,
      deleted: false,
      created_at: new Date().toISOString(),
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            text: replySnapshot.text,
            sender: replySnapshot.isMe ? "You" : selectedUser.username,
            sender_id: replySnapshot.isMe ? String(currentUserId) : String(selectedUser.id),
          }
        : null,
      file: file
        ? {
            id: "",
            name: file.name,
            mime_type: file.type,
            size: file.size,
            message_type: kindFromMime(file.type),
            url: localUrl || "",
          }
        : null,
      uploading: !!file,
    };

    appendMessage(peerKey, optimistic);
    bumpMeta(peerKey, {
      preview: previewFromMessage(text || null, file?.name),
      ts: Date.now(),
    });

    // Reset input UI
    setInput("");
    setReplyTo(null);
    setPreviewFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    let attachment: ChatAttachment | null = null;

    if (file) {
      setIsUploading(true);
      try {
        attachment = await uploadAttachment(file, currentUserId);
        // Swap blob → real URL but keep tmpId for reconciliation
        patchMessage(peerKey, tmpId, { file: attachment, uploading: false, upload_error: null });
      } catch (err: any) {
        console.error("Upload failed:", err);
        toast.error(err?.message || "Upload failed");
        patchMessage(peerKey, tmpId, { uploading: false, upload_error: "Upload failed" });
        if (localUrl) URL.revokeObjectURL(localUrl);
        setIsUploading(false);
        return;
      }
      if (localUrl) URL.revokeObjectURL(localUrl);
      setIsUploading(false);
    }

    const ok = sendChatMessage(wsRef.current, {
      senderId: currentUserId,
      receiverId: peerId,
      text: text || null,
      fileId: attachment?.id || null,
      replyToId: replySnapshot?.id || null,
    });

    if (!ok) {
      toast.error("Disconnected — message not sent");
      patchMessage(peerKey, tmpId, { upload_error: "Not sent" });
      connectWebSocket();
    }
  };

  const handlePickFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }
    setPreviewFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const kind = kindFromMime(file.type);
    setPreviewUrl(kind === "image" || kind === "video" ? URL.createObjectURL(file) : null);
  };

  const cancelPreview = () => {
    setPreviewFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Drag & drop
  const handleDragEnter = (e: React.DragEvent) => {
    if (!selectedUser) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePickFile(file);
  };

  const handleReply = (msg: { id: string; text: string; isMe: boolean }) => setReplyTo(msg);
  const handleForwardRequest = (msg: { id: string; text: string; file: ChatAttachment | null }) => setForwardMsg(msg);

  const handleForwardSend = (targetUserIds: (string | number)[]) => {
    if (!forwardMsg || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const text = forwardMsg.text || "";
    const fileId = forwardMsg.file?.id || null;
    if (!text && !fileId) return;
    wsRef.current.send(
      JSON.stringify({
        type: "forward_message",
        sender_id: currentUserId,
        message: text,
        file_id: fileId,
        target_user_ids: targetUserIds,
      }),
    );
    setForwardMsg(null);
  };

  const handleDelete = (msg: { id: string; isMe: boolean; deleteType: "me" | "everyone" }) => {
    const currentChatId = selectedUser ? generateChatId(currentUserId, selectedUser.id) : chatId;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "delete_message",
          message_id: msg.id,
          user_id: currentUserId,
          delete_type: msg.deleteType,
          ...(currentChatId ? { chat_id: currentChatId } : {}),
        }),
      );
    }
    applyDeletedMessage(msg.id, msg.deleteType);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLogout = () => {
    if (wsRef.current) wsRef.current.close();
    sessionStorage.removeItem("whchat_session");
    navigate("/login");
  };

  const filteredUsers = users
    .filter((u) => u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const ma = chatMetaByUser[String(a.id)]?.lastActivity || 0;
      const mb = chatMetaByUser[String(b.id)]?.lastActivity || 0;
      if (ma !== mb) return mb - ma;
      return a.username.localeCompare(b.username);
    });
  const selectedUserStatusInfo = selectedUser
    ? userStatuses[String(selectedUser.id)] || { status: "Offline" as const, last_seen: null }
    : undefined;
  const selectedStatusDisplay = formatStatusDisplay(selectedUserStatusInfo);

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-80" : "w-0"} md:w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all duration-200 overflow-hidden`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-[#1E90FF] to-[#22C55E]">
          <div className="flex items-center gap-2">
            <img src={logo} alt="WH-Chat" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-semibold text-white text-lg">WH-Chat</span>
          </div>
          <div className="flex items-center gap-1">
            {!wsConnected && (
              <div className="p-2 text-yellow-200" title="Reconnecting...">
                <WifiOff className="h-4 w-4" />
              </div>
            )}
            <button
              onClick={() => navigate("/channels")}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Channels"
            >
              <img src={channelIcon} alt="" className="h-5 w-5 object-contain" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1E90FF] focus:ring-1 focus:ring-[#1E90FF]/30 transition-colors"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingUsers ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-11 w-11 rounded-full bg-gray-200" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="h-10 w-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No users found</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filteredUsers.map((user) => {
                const meta = chatMetaByUser[String(user.id)];
                const hasActivity = !!(meta && (meta.lastActivity || meta.lastPreview));
                const unread = meta?.unread || 0;
                const isSelected = selectedUser?.id === user.id;
                const status = formatStatusDisplay(userStatuses[String(user.id)]);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                      isSelected ? "bg-[#8B5CF6]/10 border border-[#8B5CF6]/20" : "hover:bg-gray-50"
                    }`}
                  >
                    <Avatar className="h-11 w-11">
                      <AvatarFallback
                        className={`bg-gradient-to-br ${getAvatarColor(user.username)} text-white text-sm font-semibold`}
                      >
                        {getInitials(user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-sm font-medium truncate ${isSelected ? "text-[#8B5CF6]" : "text-gray-900"}`}
                        >
                          {user.username}
                        </p>
                        {hasActivity && meta?.lastActivity ? (
                          <span
                            className={`text-[11px] flex-shrink-0 ${
                              unread > 0 ? "text-[#22C55E] font-semibold" : "text-gray-400"
                            }`}
                          >
                            {formatChatTime(meta.lastActivity)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        {hasActivity && meta?.lastPreview ? (
                          <p
                            className={`text-xs truncate ${
                              unread > 0 ? "text-gray-700 font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {meta.lastPreview}
                          </p>
                        ) : status.text ? (
                          <p
                            className={`text-xs flex items-center gap-1 truncate ${
                              status.isActive ? "text-green-500" : "text-muted-foreground"
                            }`}
                          >
                            {status.isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />}
                            {status.text}
                          </p>
                        ) : (
                          <span />
                        )}
                        {unread > 0 && (
                          <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white text-[11px] font-semibold flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gradient-to-br from-[#1E90FF] to-[#22C55E] text-white text-xs font-semibold">
                {session?.username ? getInitials(session.username) : "?"}
              </AvatarFallback>
            </Avatar>
            <p className="text-sm font-medium text-gray-900 truncate">{session?.username || "User"}</p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && selectedUser && (
          <div className="absolute inset-0 z-50 bg-[#3390ec]/10 border-4 border-dashed border-[#3390ec] flex items-center justify-center pointer-events-none animate-fade-in">
            <div className="bg-white rounded-2xl px-6 py-4 shadow-lg flex items-center gap-3">
              <Paperclip className="h-6 w-6 text-[#3390ec]" />
              <p className="text-base font-semibold text-[#3390ec]">Drop file to send</p>
            </div>
          </div>
        )}

        {selectedUser ? (
          <>
            <div className="h-16 px-4 md:px-6 flex items-center gap-3 border-b border-gray-200 bg-white">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <MessageCircle className="h-5 w-5" />
              </button>
              <Avatar className="h-10 w-10">
                <AvatarFallback
                  className={`bg-gradient-to-br ${getAvatarColor(selectedUser.username)} text-white text-sm font-semibold`}
                >
                  {getInitials(selectedUser.username)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-base font-semibold text-gray-900">{selectedUser.username}</p>
                {selectedStatusDisplay.text && (
                  <p
                    className={`text-xs flex items-center gap-1 ${selectedStatusDisplay.isActive ? "text-green-500" : "text-muted-foreground"}`}
                  >
                    {selectedStatusDisplay.isActive && (
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    )}
                    {selectedStatusDisplay.text}
                  </p>
                )}
              </div>
            </div>

            <ChatMessages
              chatId={chatId}
              currentUserId={currentUserId}
              selectedUsername={selectedUser.username}
              localMessages={messages}
              deletionOverrides={deletedMessagesById}
              onReply={handleReply}
              onForward={handleForwardRequest}
              onDelete={handleDelete}
            />

            <div className="bg-[#e8ebf0] px-2 py-[5px] md:px-[10px]">
              {replyTo && (
                <div className="mb-[5px]">
                  <div className="flex items-center gap-2 px-3 py-[6px] rounded-xl bg-white/80 border-l-[3px] border-[#3390ec]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#3390ec] leading-tight">
                        {replyTo.isMe ? "You" : selectedUser.username}
                      </p>
                      <p className="text-[13px] text-[#707579] truncate leading-tight">{replyTo.text}</p>
                    </div>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="p-1 rounded-full text-[#707579] hover:text-[#3390ec] hover:bg-black/5 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {previewFile && (
                <div className="mb-[5px]">
                  <div className="flex items-center gap-3 px-3 py-[8px] rounded-xl bg-white/90 border border-gray-200 shadow-sm animate-fade-in">
                    {previewUrl && kindFromMime(previewFile.type) === "image" ? (
                      <img
                        src={previewUrl}
                        alt={previewFile.name}
                        className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : previewUrl && kindFromMime(previewFile.type) === "video" ? (
                      <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-black flex-shrink-0">
                        <video src={previewUrl} className="h-full w-full object-cover" muted />
                        <Film className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-[#3390ec]/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-6 w-6 text-[#3390ec]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{previewFile.name}</p>
                      <p className="text-[12px] text-[#707579]">{formatFileSize(previewFile.size)}</p>
                    </div>
                    <button
                      onClick={cancelPreview}
                      disabled={isUploading}
                      className="p-1 rounded-full text-[#707579] hover:text-destructive hover:bg-black/5 transition-colors disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-[6px]">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
                  onChange={(e) => {
                    handlePickFile(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-[42px] w-[42px] rounded-full text-[#707579] hover:text-[#3390ec] hover:bg-white/60 transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                  title="Attach file"
                >
                  <Paperclip className="h-[22px] w-[22px]" />
                </button>

                <div className="flex-1 flex items-end bg-white rounded-[21px] shadow-sm min-h-[42px]">
                  <input
                    ref={messageInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={previewFile ? "Add a caption…" : "Message"}
                    className="flex-1 bg-transparent px-[14px] py-[9px] text-[15px] text-[#000000] placeholder:text-[#a2acb4] focus:outline-none leading-[22px]"
                    autoFocus
                  />
                </div>
                {input.trim() || previewFile ? (
                  <button
                    onClick={handleSend}
                    disabled={!wsConnected || isUploading}
                    className="h-[42px] w-[42px] rounded-full bg-[#3390ec] text-white flex items-center justify-center hover:bg-[#2b7ed8] active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0 shadow-sm"
                  >
                    <Send className="h-5 w-5 ml-[1px]" />
                  </button>
                ) : (
                  <button className="h-[42px] w-[42px] rounded-full text-[#a2acb4] flex items-center justify-center hover:text-[#707579] transition-colors flex-shrink-0">
                    <Smile className="h-[22px] w-[22px]" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden absolute top-4 left-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-[#1E90FF]/10 to-[#22C55E]/10 flex items-center justify-center mx-auto mb-4">
                <img src={logo} alt="WH-Chat" className="h-12 w-12 rounded-xl object-contain" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">WH-Chat Box</h2>
              <p className="text-sm text-gray-400 max-w-xs">Select a user from the sidebar to start chatting</p>
            </div>
          </div>
        )}
      </div>

      <ForwardModal
        open={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        users={users}
        messageText={forwardMsg?.text || (forwardMsg?.file ? `📎 ${forwardMsg.file.name}` : "")}
        onForward={handleForwardSend}
      />
    </div>
  );
}
