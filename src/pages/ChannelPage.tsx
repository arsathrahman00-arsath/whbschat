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
import { CHANNEL_ENDPOINTS, channelWsUrl, userWsUrl } from "@/lib/channelConfig";
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

function previewFromPost(p: { message?: string | null; file?: { name?: string } | null }): string {
  if (p.message) {
    const text = p.message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  if (p.file?.name) return `📎 ${p.file.name}`;
  return "";
}

function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => {
    const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
    const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (a.name || "").localeCompare(b.name || "");
  });
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
  const [rejecting, setRejecting] = useState(false);

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
      setChannels(sortChannels(arr.map((c: any) => mapToChannel(c, currentUserId))));
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

        // Unread reset (server-confirmed mark-as-read)
        if (data.type === "channel_unread_reset") {
          const cid = data.channel_id ?? data.data?.channel_id;
          if (cid == null) return;
          setChannels((prev) =>
            prev.map((c) =>
              String(c.id) === String(cid) ? { ...c, unread_count: 0 } : c,
            ),
          );
          return;
        }

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
        const isOwn = String(post.sender_id) === String(currentUserId);
        const serverUnread =
          typeof data.unread_count === "number"
            ? data.unread_count
            : typeof payload.unread_count === "number"
              ? payload.unread_count
              : null;

        // Update channel-list meta: preview, time, unread, then re-sort.
        setChannels((prev) => {
          const idx = prev.findIndex((c) => String(c.id) === String(cid));
          if (idx === -1) return prev;
          const cur = prev[idx];
          // Active channel is being viewed → keep unread at 0; others increment.
          let nextUnread = cur.unread_count ?? 0;
          if (serverUnread != null) {
            nextUnread = serverUnread;
          } else if (!isOwn) {
            const isActive =
              document.visibilityState === "visible" &&
              String(selectedRef.current?.id) === String(cid);
            if (!isActive) nextUnread = nextUnread + 1;
          }
          const updated: Channel = {
            ...cur,
            last_message: previewFromPost(post) || cur.last_message || null,
            last_message_time: post.created_at,
            unread_count: nextUnread,
          };
          const next = [...prev];
          next[idx] = updated;
          return sortChannels(next);
        });

        setPostsByChannel((prev) => {
          const key = String(cid);
          const list = prev[key] || [];
          // dedupe by real id
          if (!post.id.startsWith("tmp-") && list.some((p) => p.id === post.id)) return prev;
          // try to swap an optimistic tmp post from this user
          if (isOwn) {
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

  // ---- User-level WebSocket: global unread updates across all channels ----
  // Stays open for the lifetime of the page; auto-reconnects with backoff.
  useEffect(() => {
    if (!currentUserId) return;
    let userWs: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    let cancelled = false;

    const applyUnreadUpdate = (d: any) => {
      const cid = d.channel_id ?? d.data?.channel_id;
      if (cid == null) return;
      const unread =
        typeof d.unread_count === "number"
          ? d.unread_count
          : typeof d.data?.unread_count === "number"
            ? d.data.unread_count
            : null;
      const lastMsg = d.last_message ?? d.data?.last_message ?? null;
      const ts = d.created_at ?? d.data?.created_at ?? null;
      const senderId = d.sender_id ?? d.data?.sender_id ?? null;
      const isOwn = senderId != null && String(senderId) === String(currentUserId);
      // If the user is currently viewing this channel, never bump unread.
      const viewing =
        document.visibilityState === "visible" &&
        String(selectedRef.current?.id) === String(cid);

      setChannels((prev) => {
        const idx = prev.findIndex((c) => String(c.id) === String(cid));
        if (idx === -1) return prev;
        const cur = prev[idx];
        let nextUnread = cur.unread_count ?? 0;
        if (viewing || isOwn) {
          nextUnread = viewing ? 0 : nextUnread;
        } else if (unread != null) {
          nextUnread = unread;
        } else {
          nextUnread = nextUnread + 1;
        }
        const cleanPreview =
          typeof lastMsg === "string"
            ? lastMsg.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
            : cur.last_message;
        const updated: Channel = {
          ...cur,
          unread_count: nextUnread,
          last_message: cleanPreview || cur.last_message || null,
          last_message_time: ts || cur.last_message_time || new Date().toISOString(),
        };
        const next = [...prev];
        next[idx] = updated;
        return sortChannels(next);
      });
    };

    const applyUnreadReset = (d: any) => {
      const cid = d.channel_id ?? d.data?.channel_id;
      if (cid == null) return;
      setChannels((prev) =>
        prev.map((c) =>
          String(c.id) === String(cid) ? { ...c, unread_count: 0 } : c,
        ),
      );
    };

    const connect = () => {
      if (cancelled) return;
      try {
        userWs = new WebSocket(userWsUrl(currentUserId));
      } catch {
        scheduleReconnect();
        return;
      }
      userWs.onopen = () => {
        attempts = 0;
        console.log("USER WS CONNECTED");
      };
      userWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("USER WS EVENT:", data);
          if (data.type === "channel_unread_update") applyUnreadUpdate(data);
          else if (data.type === "channel_unread_reset") applyUnreadReset(data);
        } catch {
          /* ignore */
        }
      };
      userWs.onclose = () => scheduleReconnect();
      userWs.onerror = () => {
        try {
          userWs?.close();
        } catch {
          /* noop */
        }
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      attempts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
      reconnectTimer = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        userWs?.close();
      } catch {
        /* noop */
      }
    };
  }, [currentUserId]);

  // ---- Handlers ----
  const markChannelRead = useCallback(
    (channelId: string | number) => {
      if (!currentUserId) return;
      const ws = wsRef.current;
      const payload = {
        type: "channel_mark_read",
        channel_id: channelId,
        user_id: currentUserId,
      };
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
          return;
        } catch {
          // fall through to HTTP
        }
      }
      // HTTP fallback
      fetch(CHANNEL_ENDPOINTS.markChannelRead, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, user_id: currentUserId }),
      }).catch(() => {
        /* best-effort */
      });
    },
    [currentUserId],
  );

  const handleSelect = (c: Channel) => {
    setSelected(c);
    if (!postsByChannel[String(c.id)]) loadPosts(c.id);
    // Optimistically clear unread for the opened channel.
    setChannels((prev) =>
      prev.map((ch) =>
        String(ch.id) === String(c.id) ? { ...ch, unread_count: 0 } : ch,
      ),
    );
    // Tell server (WS preferred, HTTP fallback). The WS event for THIS
    // channel may not be open yet, so defer slightly so the new socket
    // (opened by the selected-effect) has a chance to connect.
    setTimeout(() => markChannelRead(c.id), 200);
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
      if (!ch.is_admin) {
        toast.error("Only admin can post in this channel");
        return false;
      }

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

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || rejecting) return;
    setRejecting(true);
    try {
      const listRes = await fetch(`${CHANNEL_ENDPOINTS.list}?user_id=${currentUserId}`);
      const listJson = await listRes.json();
      const arr = Array.isArray(listJson) ? listJson : listJson.data || listJson.channels || [];
      const match = arr.find((c: any) => String(c.id) === String(selected.id));
      const channel_id = match?.id ?? selected.id;

      const res = await fetch(CHANNEL_ENDPOINTS.rejectCleanData, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === "error") {
        throw new Error(json?.message || json?.error || `Reject failed (${res.status})`);
      }

      const count =
        json?.rejected ?? json?.count ?? json?.data?.rejected ?? json?.data?.count;
      const successMsg =
        json?.message ||
        (typeof count === "number" ? `Rejected ${count} records` : "Rejected successfully");
      toast.success(successMsg);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  // Listen for approve/reject clicks on backend HTML messages
  // (dispatched by HtmlMessage). Keep handler refs fresh.
  const handleApproveRef = useRef(handleApprove);
  const handleRejectRef = useRef(handleReject);
  useEffect(() => {
    handleApproveRef.current = handleApprove;
    handleRejectRef.current = handleReject;
  });
  useEffect(() => {
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      if (detail?.action === "approve") {
        handleApproveRef.current();
      } else if (detail?.action === "reject") {
        handleRejectRef.current();
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
