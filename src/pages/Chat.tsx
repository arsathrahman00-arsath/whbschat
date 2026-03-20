import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, LogOut, Search, MessageCircle } from "lucide-react";
import logo from "@/assets/logo.jpg";

interface ChatUser {
  id: number | string;
  username: string;
}

interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: Date;
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

export default function Chat() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const session = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("whchat_session") || "null");
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }
    fetchUsers();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("https://ngrchatbot.whindia.in/chat/get_users/");
      const data = await res.json();
      let userList: ChatUser[] = Array.isArray(data) ? data : data.users || data.results || [];

      // Remove logged-in user from the list
      if (session?.username) {
        userList = userList.filter(
          (u) => u.username.toLowerCase() !== session.username.toLowerCase()
        );
      }

      // Special case: if logged-in user is "rahmanarsath", show only "mohamed" and "Mohamed illyas"
      if (session?.username === "rahmanarsath") {
        userList = userList.filter(
          (u) => u.username.toLowerCase() === "mohamed" || u.username.toLowerCase() === "mohamed illyas"
        );
      }

      setUsers(userList);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || !selectedUser) return;
    const msg: Message = {
      id: Date.now().toString(),
      text: input.trim(),
      sender: "me",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("whchat_session");
    navigate("/login");
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } md:w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all duration-200 overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-[#1E90FF] to-[#22C55E]">
          <div className="flex items-center gap-2">
            <img src={logo} alt="WH-Chat Box" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-semibold text-white text-lg">WH-Chat</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
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

        {/* User List */}
        <ScrollArea className="flex-1">
          {loadingUsers ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-11 w-11 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-gray-200 rounded" />
                    <div className="h-2 w-16 bg-gray-100 rounded" />
                  </div>
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
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    setSelectedUser(user);
                    setMessages([]);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                    selectedUser?.id === user.id
                      ? "bg-[#8B5CF6]/10 border border-[#8B5CF6]/20"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback
                        className={`bg-gradient-to-br ${getAvatarColor(user.username)} text-white text-sm font-semibold`}
                      >
                        {getInitials(user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#22C55E] border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      selectedUser?.id === user.id ? "text-[#8B5CF6]" : "text-gray-900"
                    }`}>
                      {user.username}
                    </p>
                    <p className="text-xs text-gray-400 truncate">Online</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Current User */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gradient-to-br from-[#1E90FF] to-[#22C55E] text-white text-xs font-semibold">
                {session?.username ? getInitials(session.username) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{session?.username || "User"}</p>
              <p className="text-xs text-[#22C55E]">Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedUser ? (
          <>
            {/* Chat Header */}
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
                <p className="text-xs text-[#22C55E] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] inline-block" />
                  Online
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 bg-gray-50">
              <div className="p-4 md:p-6 space-y-3 min-h-full flex flex-col justify-end">
                {messages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-20">
                    <div className="text-center">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1E90FF]/10 to-[#22C55E]/10 flex items-center justify-center mx-auto mb-3">
                        <MessageCircle className="h-8 w-8 text-[#1E90FF]" />
                      </div>
                      <p className="text-gray-400 text-sm">
                        Start a conversation with <span className="font-medium text-gray-600">{selectedUser.username}</span>
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.sender === "me"
                          ? "bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white rounded-br-md"
                          : "bg-gray-200 text-gray-900 rounded-bl-md"
                      }`}
                    >
                      <p className="overflow-wrap-break-word">{msg.text}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          msg.sender === "me" ? "text-white/70" : "text-gray-400"
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 md:p-4 border-t border-gray-200 bg-white">
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1E90FF] focus:ring-1 focus:ring-[#1E90FF]/30 transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="h-11 w-11 rounded-xl bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No user selected */
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden absolute top-4 left-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-[#1E90FF]/10 to-[#22C55E]/10 flex items-center justify-center mx-auto mb-4">
                <img src={logo} alt="WH-Chat Box" className="h-12 w-12 rounded-xl object-contain" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">WH-Chat Box</h2>
              <p className="text-sm text-gray-400 max-w-xs">
                Select a conversation from the sidebar to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
