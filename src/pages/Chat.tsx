import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, LogOut, Search, MessageCircle, WifiOff, X, Smile } from "lucide-react";
import logo from "@/assets/logo.jpg";
import ChatMessages from "@/components/ChatMessages";
import ForwardModal from "@/components/ForwardModal";
import { generateChatId } from "@/lib/chatId";

interface ChatUser {
  id: number | string;
  username: string;
  user_code?: number;
}

interface UserStatusInfo {
  status: "Active" | "Offline";
  last_seen: string | null;
}

interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  sender_id?: string | number;
  sender_name?: string;
  receiver_id?: string | number;
  time?: string;
  deleted?: boolean;
  reply_to?: { text: string; sender: string; sender_id?: string | number } | null;
}

interface ReplyTo {
  id: string;
  text: string;
  isMe: boolean;
}

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

function getCurrentTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
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

const WS_BASE_URL = "wss://ngrchatbot.whindia.in/ws/chat";

export default function Chat() {
  const navigate = useNavigate();
  const [users, setUsersState] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messagesByUser, setMessagesByUser] = useState<Record<string, Message[]>>({});
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatusInfo>>({});
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [chatId, setChatId] = useState<string | number | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [forwardMsg, setForwardMsg] = useState<{ text: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const usersRef = useRef<ChatUser[]>([]);
  const messagesByUserRef = useRef<Record<string, Message[]>>({});

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

  // Keep messagesByUserRef in sync
  useEffect(() => { messagesByUserRef.current = messagesByUser; }, [messagesByUser]);

  const messages = selectedUser ? (messagesByUser[String(selectedUser.id)] || []) : [];

  const addMessage = useCallback((userId: string | number, msg: Message) => {
    setMessagesByUser(prev => ({
      ...prev,
      [String(userId)]: [...(prev[String(userId)] || []), msg],
    }));
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!currentUserId) return;
    if (wsRef.current) wsRef.current.close();

    const wsUrl = `${WS_BASE_URL}/${currentUserId}/`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);

        // Handle user_status messages
        if (data.type === "user_status") {
          setUserStatuses(prev => ({
            ...prev,
            [String(data.user_id)]: {
              status: data.status === "Active" ? "Active" : "Offline",
              last_seen: data.last_seen || null,
            },
          }));
          return;
        }

        // Handle message_deleted FIRST — before any sender checks
        if (data.type === "message_deleted") {
          const deletedId = String(data.message_id);
          console.log("Processing message_deleted:", deletedId);
          setMessagesByUser(prev => {
            const updated: typeof prev = {};
            for (const key of Object.keys(prev)) {
              updated[key] = prev[key].map(m =>
                String(m.id) === deletedId ? { ...m, deleted: true, text: "This message was deleted" } : m
              );
            }
            return updated;
          });
          return;
        }

        // Handle chat_message (or default message type)
        const senderId = String(data.sender_id);
        const isFromMe = senderId === String(currentUserId);

        // Resolve sender name: prefer backend field, fallback to users list
        const senderName =
          data.sender_name ||
          usersRef.current.find(u => String(u.id) === senderId)?.username ||
          "User";

        console.log("WS DATA:", data);
        console.log("SENDER NAME:", senderName);

        // Show desktop notification for incoming messages when tab is inactive
        if (!isFromMe && data.type === "chat_message" && "Notification" in window && Notification.permission === "granted" && document.hidden) {
          const notification = new Notification(senderName, {
            body: data.message,
            icon: "/logo.png",
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }

        // For own messages: update temp ID with real DB ID, preserve reply_to
        if (isFromMe) {
          if (data.id) {
            const dbId = String(data.id);
            const receiverId = String(data.receiver_id);
            setMessagesByUser(prev => {
              const userMsgs = prev[receiverId];
              if (!userMsgs) return prev;
              // Skip if real ID already exists (avoid duplicates)
              if (userMsgs.some(m => m.id === dbId)) return prev;
              const updated = [...userMsgs];
              let matched = false;
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].id.startsWith("sent-") && updated[i].text === data.message && String(updated[i].receiver_id) === receiverId) {
                  updated[i] = { ...updated[i], id: dbId };
                  matched = true;
                  break;
                }
              }
              return matched ? { ...prev, [receiverId]: updated } : prev;
            });
          }
          return;
        }

        // Map reply_to using sender_id for identity, sender for display name
        let replyToData: { text: string; sender: string; sender_id?: string | number } | null = null;
        if (data.reply_to) {
          if (typeof data.reply_to === "object") {
            const replySid = data.reply_to.sender_id;
            replyToData = {
              text: data.reply_to.text || "",
              sender: replySid
                ? (String(replySid) === String(currentUserId) ? "You" : (data.reply_to.sender || senderName || "User"))
                : (data.reply_to.sender || "User"),
              sender_id: replySid,
            };
          } else if (typeof data.reply_to === "string" || typeof data.reply_to === "number") {
            // reply_to is a message ID — look up from local state
            const replyId = String(data.reply_to);
            let foundMsg: Message | undefined;
            const allUserKeys = Object.keys(messagesByUserRef.current);
            for (const key of allUserKeys) {
              foundMsg = messagesByUserRef.current[key]?.find(m => String(m.id) === replyId);
              if (foundMsg) break;
            }
            if (foundMsg) {
              const replySid = foundMsg.sender_id;
              replyToData = {
                text: foundMsg.deleted ? "This message was deleted" : foundMsg.text,
                sender: replySid
                  ? (String(replySid) === String(currentUserId) ? "You" : (foundMsg.sender_name || "User"))
                  : (foundMsg.sender === "me" ? "You" : "User"),
                sender_id: replySid,
              };
            } else if (data.reply_to_text) {
              // Fallback to flat fields if present
              const replySid = data.reply_to_sender_id;
              replyToData = {
                text: data.reply_to_text || "",
                sender: replySid
                  ? (String(replySid) === String(currentUserId) ? "You" : (data.reply_to_sender || "User"))
                  : (data.reply_to_sender || "User"),
                sender_id: replySid,
              };
            }
          }
        }

        addMessage(senderId, {
          id: String(data.id || data.message_id || `ws-${Date.now()}`),
          text: data.message,
          sender: "other",
          sender_id: data.sender_id,
          sender_name: senderName,
          receiver_id: data.receiver_id,
          time: data.time || getCurrentTime(),
          reply_to: replyToData,
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
  }, [currentUserId, addMessage]);

  useEffect(() => {
    if (!session) { navigate("/login"); return; }
    fetchUsers();
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const handleSelectUser = (user: ChatUser) => {
    setSelectedUser(user);
    setSidebarOpen(false);
    const id = generateChatId(currentUserId, user.id);
    setChatId(id);

    // Request user status from backend via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "get_status",
        target_user_id: user.id,
      }));
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
      if (currentUserId) userList = userList.filter(u => String(u.id) !== String(currentUserId));
      if (session?.username) userList = userList.filter(u => u.username.toLowerCase() !== session.username.toLowerCase());
      setUsers(userList);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || !selectedUser) return;

    const msgPayload: any = {
      sender_id: currentUserId,
      receiver_id: selectedUser.id,
      message: input.trim(),
    };

    if (replyTo) {
      msgPayload.reply_to = replyTo.id;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msgPayload));
    } else {
      console.warn("WebSocket not connected, attempting reconnect...");
      connectWebSocket();
    }

    addMessage(String(selectedUser.id), {
      id: `sent-${Date.now()}`,
      text: input.trim(),
      sender: "me",
      sender_id: currentUserId,
      sender_name: session?.username || "You",
      receiver_id: selectedUser.id,
      time: getCurrentTime(),
      reply_to: replyTo ? { text: replyTo.text, sender: replyTo.isMe ? "You" : selectedUser.username } : null,
    });
    setInput("");
    setReplyTo(null);
  };

  const handleReply = (msg: { id: string; text: string; isMe: boolean }) => {
    setReplyTo(msg);
  };

  const handleForwardRequest = (msg: { text: string }) => {
    setForwardMsg(msg);
  };

  const handleForwardSend = (targetUserIds: (string | number)[]) => {
    if (!forwardMsg || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "forward_message",
      sender_id: currentUserId,
      message: forwardMsg.text,
      target_user_ids: targetUserIds,
    }));
    setForwardMsg(null);
  };

  const handleDelete = (msg: { id: string; isMe: boolean }) => {
    if (!selectedUser) return;
    const userId = String(selectedUser.id);

    // Send delete via WebSocket for both users
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "delete_message",
        message_id: msg.id,
      }));
    }
    // Update UI instantly
    const msgId = String(msg.id);
    setMessagesByUser(prev => ({
      ...prev,
      [userId]: (prev[userId] || []).map(m =>
        String(m.id) === msgId ? { ...m, deleted: true, text: "This message was deleted" } : m
      ),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleLogout = () => {
    if (wsRef.current) wsRef.current.close();
    sessionStorage.removeItem("whchat_session");
    navigate("/login");
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedUserStatusInfo = selectedUser
    ? userStatuses[String(selectedUser.id)] || { status: "Offline" as const, last_seen: null }
    : undefined;
  const selectedStatusDisplay = formatStatusDisplay(selectedUserStatusInfo);

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} md:w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all duration-200 overflow-hidden`}>
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-[#1E90FF] to-[#22C55E]">
          <div className="flex items-center gap-2">
            <img src={logo} alt="WH-Chat" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-semibold text-white text-lg">WH-Chat</span>
          </div>
          <div className="flex items-center gap-1">
            {!wsConnected && <div className="p-2 text-yellow-200" title="Reconnecting..."><WifiOff className="h-4 w-4" /></div>}
            <button onClick={handleLogout} className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors" title="Logout">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1E90FF] focus:ring-1 focus:ring-[#1E90FF]/30 transition-colors" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingUsers ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
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
              {filteredUsers.map(user => (
                <button key={user.id} onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                    selectedUser?.id === user.id ? "bg-[#8B5CF6]/10 border border-[#8B5CF6]/20" : "hover:bg-gray-50"
                  }`}>
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className={`bg-gradient-to-br ${getAvatarColor(user.username)} text-white text-sm font-semibold`}>
                      {getInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedUser?.id === user.id ? "text-[#8B5CF6]" : "text-gray-900"}`}>
                      {user.username}
                    </p>
                    {(() => {
                      const s = formatStatusDisplay(userStatuses[String(user.id)]);
                      return s.text ? (
                        <p className={`text-xs flex items-center gap-1 ${s.isActive ? "text-green-500" : "text-muted-foreground"}`}>
                          {s.isActive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />}
                          {s.text}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </button>
              ))}
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
      <div className="flex-1 flex flex-col min-w-0">
        {selectedUser ? (
          <>
            <div className="h-16 px-4 md:px-6 flex items-center gap-3 border-b border-gray-200 bg-white">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1 rounded-lg text-gray-500 hover:bg-gray-100">
                <MessageCircle className="h-5 w-5" />
              </button>
              <Avatar className="h-10 w-10">
                <AvatarFallback className={`bg-gradient-to-br ${getAvatarColor(selectedUser.username)} text-white text-sm font-semibold`}>
                  {getInitials(selectedUser.username)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-base font-semibold text-gray-900">{selectedUser.username}</p>
                {selectedStatusDisplay.text && (
                  <p className={`text-xs flex items-center gap-1 ${selectedStatusDisplay.isActive ? "text-green-500" : "text-muted-foreground"}`}>
                    {selectedStatusDisplay.isActive && <span className="inline-block h-2 w-2 rounded-full bg-green-500" />}
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
              onReply={handleReply}
              onForward={handleForwardRequest}
              onDelete={handleDelete}
            />

            <div className="bg-[#e8ebf0] px-2 py-[5px] md:px-[10px]">
              {/* Reply preview */}
              {replyTo && (
                <div className="mb-[5px]">
                  <div className="flex items-center gap-2 px-3 py-[6px] rounded-xl bg-white/80 border-l-[3px] border-[#3390ec]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#3390ec] leading-tight">
                        {replyTo.isMe ? "You" : selectedUser.username}
                      </p>
                      <p className="text-[13px] text-[#707579] truncate leading-tight">{replyTo.text}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="p-1 rounded-full text-[#707579] hover:text-[#3390ec] hover:bg-black/5 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-end gap-[6px]">
                <div className="flex-1 flex items-end bg-white rounded-[21px] shadow-sm min-h-[42px]">
                  <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Message"
                    className="flex-1 bg-transparent px-[14px] py-[9px] text-[15px] text-[#000000] placeholder:text-[#a2acb4] focus:outline-none leading-[22px]" />
                </div>
                {input.trim() ? (
                  <button onClick={handleSend} disabled={!wsConnected}
                    className="h-[42px] w-[42px] rounded-full bg-[#3390ec] text-white flex items-center justify-center hover:bg-[#2b7ed8] active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0 shadow-sm">
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
            <button onClick={() => setSidebarOpen(true)} className="md:hidden absolute top-4 left-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100">
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

      {/* Forward modal */}
      <ForwardModal
        open={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        users={users}
        messageText={forwardMsg?.text || ""}
        onForward={handleForwardSend}
      />
    </div>
  );
}
