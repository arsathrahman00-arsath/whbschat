import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Search, Check } from "lucide-react";
import { toProperCase } from "@/lib/utils";

interface ForwardUser {
  id: number | string;
  username: string;
}

interface ForwardModalProps {
  open: boolean;
  onClose: () => void;
  users: ForwardUser[];
  messageText: string;
  onForward: (targetUserIds: (string | number)[]) => void;
}

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ForwardModal({ open, onClose, users, messageText, onForward }: ForwardModalProps) {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [search, setSearch] = useState("");

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: string | number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    if (selected.size === 0) return;
    onForward(Array.from(selected));
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setSelected(new Set()); setSearch(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward Message</DialogTitle>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-sm text-gray-600 line-clamp-2">{messageText}</p>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-[#1E90FF] focus:ring-1 focus:ring-[#1E90FF]/30"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.map(user => {
            const isSelected = selected.has(user.id);
            return (
              <button
                key={user.id}
                onClick={() => toggle(user.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isSelected ? "bg-[#1E90FF]/10" : "hover:bg-gray-50"
                }`}
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-to-br from-[#1E90FF] to-[#22C55E] text-white text-xs font-semibold">
                    {getInitials(user.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-gray-900 flex-1 text-left">{toProperCase(user.username)}</span>
                {isSelected && (
                  <div className="h-5 w-5 rounded-full bg-[#1E90FF] flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <button
            onClick={handleSend}
            className="w-full mt-3 h-11 rounded-xl bg-gradient-to-r from-[#1E90FF] to-[#22C55E] text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Send className="h-4 w-4" />
            Send to {selected.size} user{selected.size > 1 ? "s" : ""}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
