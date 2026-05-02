// Left sidebar listing channels the user belongs to.
// Includes a "Create channel" button that opens an inline dialog.

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, ArrowLeft, Check, UserX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/lib/channelTypes";
import { fetchChatUsers, type ChatUserLite } from "@/lib/chatUsersApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import channelImage from "@/assets/channel.jpg";
import channelIcon from "@/assets/channel-icon.jpg";

interface Props {
  channels: Channel[];
  selectedId: string | number | null;
  loading: boolean;
  currentUserId?: string | number;
  onSelect: (c: Channel) => void;
  onCreate: (
    name: string,
    description: string,
    memberIds: Array<string | number>,
  ) => Promise<void>;
  onBackToChat: () => void;
}

function getInitials(name: string) {
  return (name || "C").slice(0, 2).toUpperCase();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const dayMs = 24 * 60 * 60 * 1000;
  if (now.getTime() - d.getTime() < 7 * dayMs) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

export default function ChannelSidebar({
  channels,
  selectedId,
  loading,
  currentUserId,
  onSelect,
  onCreate,
  onBackToChat,
}: Props) {
  const [query, setQuery] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Multi-select members for the new channel
  const [users, setUsers] = useState<ChatUserLite[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  // Load users when create dialog opens
  useEffect(() => {
    if (!openCreate) return;
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      try {
        const list = await fetchChatUsers();
        if (!cancelled) setUsers(list);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load users");
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openCreate]);

  const memberOptions = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (currentUserId != null && String(u.id) === String(currentUserId)) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        String(u.id).toLowerCase().includes(q) ||
        (u.user_code?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, memberQuery, currentUserId]);

  const toggleMember = (id: string | number) => {
    const key = String(id);
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetCreateForm = () => {
    setName("");
    setDescription("");
    setSelectedMemberIds(new Set());
    setMemberQuery("");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(
        name.trim(),
        description.trim(),
        Array.from(selectedMemberIds),
      );
      resetCreateForm();
      setOpenCreate(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="w-80 border-r bg-card flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBackToChat}
          title="Back to chats"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold text-foreground flex-1">Channels</h2>
        <Button size="icon" className="h-8 w-8" onClick={() => setOpenCreate(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels"
            className="pl-8 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No channels yet. Create one to get started.
          </div>
        ) : (
          <ul>
            {filtered.map((c) => {
              const active = String(c.id) === String(selectedId);
              const unread = c.unread_count ?? 0;
              const hasUnread = unread > 0;
              const previewRaw = c.last_message ?? c.description ?? "";
              const preview = stripHtml(previewRaw);
              const time = formatTime(c.last_message_time);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left ${
                      active ? "bg-muted" : ""
                    }`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={channelImage} alt={`${c.name} channel`} className="object-cover" />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm">
                        {getInitials(c.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <img src={channelIcon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                        <span
                          className={`text-sm truncate flex-1 ${
                            hasUnread ? "font-bold text-foreground" : "font-medium"
                          }`}
                        >
                          {c.name}
                        </span>
                        {time && (
                          <span
                            className={`text-[10px] shrink-0 ${
                              hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            {time}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p
                          className={`text-xs truncate flex-1 ${
                            hasUnread ? "text-foreground/80" : "text-muted-foreground"
                          }`}
                        >
                          {preview || (c.description ?? "")}
                        </p>
                        {hasUnread && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm animate-in fade-in zoom-in-50 duration-200">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <Dialog
        open={openCreate}
        onOpenChange={(o) => {
          setOpenCreate(o);
          if (!o) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Channel"
                maxLength={64}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this channel about?"
                rows={3}
                maxLength={280}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Add members
                  {selectedMemberIds.size > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({selectedMemberIds.size} selected)
                    </span>
                  )}
                </label>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Search users…"
                  className="pl-8 h-9"
                />
              </div>
              <ScrollArea className="h-44 rounded-md border">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : memberOptions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                    <UserX className="h-5 w-5 mb-1 opacity-60" />
                    {memberQuery.trim() ? "No matching users" : "No users available"}
                  </div>
                ) : (
                  <ul className="p-1">
                    {memberOptions.map((u) => {
                      const isSelected = selectedMemberIds.has(String(u.id));
                      return (
                        <li key={String(u.id)}>
                          <button
                            type="button"
                            onClick={() => toggleMember(u.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                              isSelected
                                ? "bg-primary/10 hover:bg-primary/15"
                                : "hover:bg-muted/60",
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleMember(u.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0"
                            />
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-[10px]">
                                {getInitials(u.username)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm truncate flex-1">{u.username}</span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
