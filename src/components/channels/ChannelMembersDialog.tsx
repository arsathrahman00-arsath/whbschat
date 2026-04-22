// Members list modal. Shows username, role badge, and (admin only) an
// "Add member" entry that opens AddMemberDialog. Members are loaded from
// /chat/get_channel_members/ each time the dialog opens.

import { useEffect, useState } from "react";
import { Loader2, UserPlus, Shield, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import AddMemberDialog from "./AddMemberDialog";
import { fetchChannelMembers } from "@/lib/channelMembersApi";
import type { ChannelMember } from "@/lib/channelTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | number;
  isAdmin: boolean;
  adminId: string | number;
}

function initials(name: string) {
  return (name || "U").slice(0, 2).toUpperCase();
}

export default function ChannelMembersDialog({
  open,
  onOpenChange,
  channelId,
  isAdmin,
  adminId,
}: Props) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchChannelMembers(channelId);
      setMembers(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Members {members.length > 0 && (
                <span className="text-muted-foreground font-normal">({members.length})</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {isAdmin && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add member
            </Button>
          )}

          <ScrollArea className="max-h-80">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No members yet
              </div>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={String(m.user_id)}
                    className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/60"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs">
                        {initials(m.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.username}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        ID: {String(m.user_id)}
                      </p>
                    </div>
                    {m.role === "admin" ? (
                      <Badge variant="default" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <User className="h-3 w-3" />
                        Member
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {isAdmin && (
        <AddMemberDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          channelId={channelId}
          adminId={adminId}
          onAdded={load}
        />
      )}
    </>
  );
}
