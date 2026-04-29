// Left sidebar listing channels the user belongs to.
// Includes a "Create channel" button that opens an inline dialog.

import { useState } from "react";
import { Plus, Search, Loader2, ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/lib/channelTypes";
import channelImage from "@/assets/channel.jpg";
import channelIcon from "@/assets/channel-icon.jpg";

interface Props {
  channels: Channel[];
  selectedId: string | number | null;
  loading: boolean;
  onSelect: (c: Channel) => void;
  onCreate: (name: string, description: string) => Promise<void>;
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
  onSelect,
  onCreate,
  onBackToChat,
}: Props) {
  const [query, setQuery] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), description.trim());
      setName("");
      setDescription("");
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
                          <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground text-[10px] font-bold shadow-sm animate-in fade-in zoom-in-50 duration-200">
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

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
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
