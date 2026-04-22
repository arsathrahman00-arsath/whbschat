// Channel page: standalone route that runs alongside direct chat.
// Owns:
//   - channels list (HTTP)
//   - posts cache by channel
//   - ONE WebSocket per selected channel (closed/replaced on switch)
// Direct-chat WS in /chat is untouched.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hash, Loader2, WifiOff, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChannelSidebar from "@/components/channels/ChannelSidebar";
import ChannelPosts from "@/components/channels/ChannelPosts";
import ChannelComposer from "@/components/channels/ChannelComposer";
import { CHANNEL_ENDPOINTS, channelWsUrl } from "@/lib/channelConfig";
import { mapToChannel, mapToChannelPost } from "@/lib/channelMappers";
import type { Channel, ChannelPost } from "@/lib/channelTypes";
import type { ChatAttachment } from "@/lib/chatMessage";

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem("whchat_session") || "null");
  } catch {
    return null;
  }
}

function initials(name: string) {
  return (name || "C").slice(0, 2).toUpperCase();
}

export default function ChannelPage() {
  const navigate = useNavigate();
  const session = readSession();
  const currentUserId = session?.userId || session?.id;
  const currentUsername: string | undefined = session?.username;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [postsByChannel, setPostsByChannel] = useState<Record<string, ChannelPost[]>>({});
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedRef = useRef<Channel | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // ---- Auth gate ----
  useEffect(() => {
    if (!currentUserId) navigate("/login");
  }, [currentUserId, navigate]);

  // ---- Load channels ----
  const loadChannels = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingChannels(true);
    try {
      const res = await fetch(`${CHANNEL_ENDPOINTS.list}?user_id=${currentUserId}`);
      const json = await res.json();
      const arr = Array.isArray(json) ? json : json.data || json.channels || [];
      setChannels(arr.map((c: any) => mapToChannel(c, currentUserId)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoadingChannels(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // ---- Load posts for a channel ----
  const loadPosts = useCallback(async (channelId: string | number) => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`${CHANNEL_ENDPOINTS.posts}?channel_id=${channelId}`);
      const json = await res.json();
      const arr = Array.isArray(json) ? json : json.data || json.posts || [];
      const mapped = arr.map((p: any) => mapToChannelPost(p, channelId));
      setPostsByChannel((prev) => ({ ...prev, [String(channelId)]: mapped }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  // ---- WebSocket per selected channel ----
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
    }
    if (!selected) return;

    const ws = new WebSocket(channelWsUrl(selected.id));
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Backends commonly use one of these for new posts.
        const isPost =
          data.type === "channel_post" ||
          data.type === "new_post" ||
          data.type === "post" ||
          data.type === "channel_message";

        if (!isPost) return;

        const payload = data.post || data.data || data;
        const cid = selectedRef.current?.id;
        if (!cid) return;

        const post = mapToChannelPost(payload, cid);

        setPostsByChannel((prev) => {
          const key = String(cid);
          const list = prev[key] || [];
          // dedupe by real id
          if (!post.id.startsWith("tmp-") && list.some((p) => p.id === post.id)) return prev;
          // try to swap an optimistic tmp post from this user
          if (String(post.sender_id) === String(currentUserId)) {
            const tmpIdx = [...list].reverse().findIndex((p) => p.id.startsWith("tmp-"));
            if (tmpIdx !== -1) {
              const realIdx = list.length - 1 - tmpIdx;
              const next = [...list];
              next[realIdx] = {
                ...next[realIdx],
                ...post,
                file: post.file ?? next[realIdx].file ?? null,
                uploading: false,
                upload_error: null,
              };
              return { ...prev, [key]: next };
            }
          }
          return { ...prev, [key]: [...list, post] };
        });
      } catch {
        // ignore non-JSON frames
      }
    };

    return () => {
      ws.close();
    };
  }, [selected, currentUserId]);

  // ---- Handlers ----
  const handleSelect = (c: Channel) => {
    setSelected(c);
    if (!postsByChannel[String(c.id)]) loadPosts(c.id);
  };

  const handleCreate = async (name: string, description: string) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(CHANNEL_ENDPOINTS.create, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          admin_id: currentUserId,
          created_by: currentUserId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `Create failed (${res.status})`);
      }
      const created = json.data || json.channel || json;
      const ch = mapToChannel(created, currentUserId);
      setChannels((prev) => {
        if (prev.some((c) => String(c.id) === String(ch.id))) return prev;
        return [ch, ...prev];
      });
      setSelected(ch);
      toast.success("Channel created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
      throw err;
    }
  };

  const handleSendPost = useCallback(
    (text: string, file: ChatAttachment | null): boolean => {
      const ws = wsRef.current;
      const ch = selectedRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !ch) return false;
      if (!text && !file) return false;

      const tmpId = `tmp-${Date.now()}`;
      const optimistic: ChannelPost = {
        id: tmpId,
        channel_id: ch.id,
        sender_id: String(currentUserId),
        sender_name: currentUsername || "Admin",
        message: text || null,
        file,
        created_at: new Date().toISOString(),
      };
      setPostsByChannel((prev) => {
        const key = String(ch.id);
        return { ...prev, [key]: [...(prev[key] || []), optimistic] };
      });

      const payload: Record<string, unknown> = {
        type: "channel_post",
        channel_id: ch.id,
        sender_id: currentUserId,
      };
      if (text) payload.message = text;
      if (file?.id) payload.file_id = file.id;
      ws.send(JSON.stringify(payload));
      return true;
    },
    [currentUserId, currentUsername],
  );

  const posts = selected ? postsByChannel[String(selected.id)] || [] : [];

  return (
    <div className="h-screen flex bg-background">
      <ChannelSidebar
        channels={channels}
        selectedId={selected?.id ?? null}
        loading={loadingChannels}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onBackToChat={() => navigate("/chat")}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Select a channel to view posts</p>
          </div>
        ) : (
          <>
            <header className="border-b bg-card px-4 py-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm">
                  {initials(selected.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <h1 className="font-semibold truncate">{selected.name}</h1>
                </div>
                {selected.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selected.description}
                  </p>
                )}
              </div>
              {!wsConnected && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <WifiOff className="h-3.5 w-3.5" />
                  offline
                </span>
              )}
            </header>

            <ChannelPosts posts={posts} loading={loadingPosts && posts.length === 0} />

            <ChannelComposer
              canPost={!!selected.is_admin}
              currentUserId={currentUserId}
              onSend={handleSendPost}
            />
          </>
        )}
      </main>
    </div>
  );
}
