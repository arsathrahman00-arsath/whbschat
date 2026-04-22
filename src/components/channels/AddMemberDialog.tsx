// Admin-only modal to add a user to a channel by selecting from the global
// chat users list. Filters out users who are already members of the channel
// so admins don't accidentally re-add them.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Check, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { addUserToChannel } from "@/lib/channelMembersApi";
import { fetchChatUsers, type ChatUserLite } from "@/lib/chatUsersApi";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | number;
  adminId: string | number;
  /** Currently joined member ids — used to filter the picker. */
  existingMemberIds?: Array<string | number>;
  onAdded: () => void;
}

function initials(name: string) {
  return (name || "U").slice(0, 2).toUpperCase();
}

export default function AddMemberDialog({
  open,
  onOpenChange,
  channelId,
  adminId,
  existingMemberIds = [],
  onAdded,
}: Props) {
  const [users, setUsers] = useState<ChatUserLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset transient state every time the dialog opens, then load users.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedId(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchChatUsers();
        if (!cancelled) setUsers(list);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load users");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const memberSet = useMemo(
    () => new Set(existingMemberIds.map((id) => String(id))),
    [existingMemberIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      // exclude the admin themselves and existing members
      if (String(u.id) === String(adminId)) return false;
      if (memberSet.has(String(u.id))) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        String(u.id).toLowerCase().includes(q) ||
        (u.user_code?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, query, adminId, memberSet]);

  const handleSubmit = async () => {
    if (selectedId == null) return;
    setSubmitting(true);
    try {
      await addUserToChannel({
        channelId,
        userId: selectedId,
        adminId,
        role: "member",
      });
      toast.success("Member added");
      setSelectedId(null);
      setQuery("");
      onAdded();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="pl-9"
              autoFocus
            />
          </div>

          <ScrollArea className="h-72 rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                <UserX className="h-6 w-6 mb-2 opacity-60" />
                No users available
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                <UserX className="h-6 w-6 mb-2 opacity-60" />
                {query.trim() ? "No matching users" : "Everyone is already a member"}
              </div>
            ) : (
              <ul className="p-1">
                {filtered.map((u) => {
                  const isSelected = String(u.id) === String(selectedId);
                  return (
                    <li key={String(u.id)}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(u.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors",
                          isSelected
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "hover:bg-muted/60",
                        )}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs">
                            {initials(u.username)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.username}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            ID: {String(u.id)}
                            {u.user_code ? ` · ${u.user_code}` : ""}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={selectedId == null || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
