// Admin-only modal to add a user to the channel by user_id and optional role.
// Kept minimal: a single user_id input + role select. No user picker — backend
// validates the id and returns a clean error if it doesn't exist.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { addUserToChannel } from "@/lib/channelMembersApi";
import type { ChannelMemberRole } from "@/lib/channelTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string | number;
  adminId: string | number;
  onAdded: () => void;
}

export default function AddMemberDialog({
  open,
  onOpenChange,
  channelId,
  adminId,
  onAdded,
}: Props) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ChannelMemberRole>("member");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = userId.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await addUserToChannel({
        channelId,
        userId: trimmed,
        adminId,
        role,
      });
      toast.success("Member added");
      setUserId("");
      setRole("member");
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
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">User ID</label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user id"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as ChannelMemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!userId.trim() || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
