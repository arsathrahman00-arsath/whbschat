// Channel page: standalone route that runs alongside direct chat.
// Owns:
//   - channels list (HTTP)
//   - posts cache by channel
//   - ONE WebSocket per selected channel (closed/replaced on switch)
// Direct-chat WS in /chat is untouched.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, MessageCircle, Users, UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ChannelSidebar from "@/components/channels/ChannelSidebar";
import ChannelPosts from "@/components/channels/ChannelPosts";
import ChannelComposer from "@/components/channels/ChannelComposer";
import ChannelMembersDialog from "@/components/channels/ChannelMembersDialog";
import { CHANNEL_ENDPOINTS, channelWsUrl } from "@/lib/channelConfig";
import { mapToChannel, mapToChannelPost } from "@/lib/channelMappers";
import { joinChannel } from "@/lib/channelMembersApi";
import type { Channel, ChannelPost } from "@/lib/channelTypes";
import type { ChatAttachment } from "@/lib/chatMessage";
import channelImage from "@/assets/channel.jpg";
import channelIcon from "@/assets/channel-icon.jpg";

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
  const [membersOpen, setMembersOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [approving, setApproving] = useState(false);

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
      // Backend create response often returns only channel_id; merge submitted
      // form values so the UI shows the correct name/description immediately.
      const merged = {
        ...created,
        id: created.id ?? created.channel_id ?? json.channel_id,
        name: created.name ?? created.channel_name ?? name,
        description: created.description ?? created.about ?? description,
        admin_id: created.admin_id ?? created.created_by ?? currentUserId,
      };
      const ch = mapToChannel(merged, currentUserId);
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

  const handleJoin = async () => {
    if (!selected || !currentUserId) return;
    setJoining(true);
    try {
      await joinChannel({ channelId: selected.id, userId: currentUserId });
      toast.success("Joined channel");
      // refresh members count / membership flag from server
      await loadChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join channel");
    } finally {
      setJoining(false);
    }
  };

  const handleApprove = async () => {
    if (!selected || approving) return;
    setApproving(true);
    try {
      // Re-fetch channels to get the latest authoritative channel_id, per spec.
      const listRes = await fetch(`${CHANNEL_ENDPOINTS.list}?user_id=${currentUserId}`);
      const listJson = await listRes.json();
      const arr = Array.isArray(listJson) ? listJson : listJson.data || listJson.channels || [];
      const match = arr.find((c: any) => String(c.id) === String(selected.id));
      const channel_id = match?.id ?? selected.id;

      const res = await fetch(CHANNEL_ENDPOINTS.approveCleanData, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === "error") {
        throw new Error(json?.message || json?.error || `Approve failed (${res.status})`);
      }

      const count =
        json?.approved ?? json?.count ?? json?.data?.approved ?? json?.data?.count;
      const successMsg =
        json?.message ||
        (typeof count === "number" ? `Approved ${count} records` : "Approved successfully");
      toast.success(successMsg);

      // Append a local system message so users see immediate feedback.
      const sysPost: ChannelPost = {
        id: `sys-${Date.now()}`,
        channel_id: selected.id,
        sender_id: "system",
        sender_name: "System",
        message: `✅ ${successMsg}`,
        file: null,
        created_at: new Date().toISOString(),
      };
      setPostsByChannel((prev) => {
        const key = String(selected.id);
        return { ...prev, [key]: [...(prev[key] || []), sysPost] };
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  // Listen for approve/reject clicks on backend HTML messages
  // (dispatched by HtmlMessage). Keep handler ref fresh.
  const handleApproveRef = useRef(handleApprove);
  useEffect(() => {
    handleApproveRef.current = handleApprove;
  });
  useEffect(() => {
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      if (detail?.action === "approve") {
        handleApproveRef.current();
      } else if (detail?.action === "reject") {
        toast.message("Reject action received");
      }
    };
    window.addEventListener("html-message-action", onAction);
    return () => window.removeEventListener("html-message-action", onAction);
  }, []);

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
                <AvatarImage src={channelImage} alt={`${selected.name} channel`} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm">
                  {initials(selected.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <img src={channelIcon} alt="" className="h-4 w-4 object-contain" />
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
              {!selected.is_admin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleJoin}
                  disabled={joining}
                  className="gap-1.5"
                >
                  {joining ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Join
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                onClick={handleApprove}
                disabled={approving}
                className="gap-1.5"
                title="Bulk approve clean data for this channel"
              >
                {approving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {approving ? "Approving…" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMembersOpen(true)}
                className="gap-1.5"
                title="View members"
              >
                <Users className="h-4 w-4" />
                {selected.members_count ? (
                  <span className="text-xs">{selected.members_count}</span>
                ) : null}
              </Button>
            </header>

            <ChannelPosts posts={posts} loading={loadingPosts && posts.length === 0} />

            <ChannelComposer
              canPost={!!selected.is_admin}
              currentUserId={currentUserId}
              onSend={handleSendPost}
            />

            <ChannelMembersDialog
              open={membersOpen}
              onOpenChange={setMembersOpen}
              channelId={selected.id}
              isAdmin={!!selected.is_admin}
              adminId={currentUserId}
            />
          </>
        )}
      </main>
    </div>
  );
}
