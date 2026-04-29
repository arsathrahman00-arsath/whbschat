// Feed view for channel posts. Renders text + attachments, grouped by date.
// Different from direct chat bubbles: posts are wide, single-column, signed.

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Attachment from "@/components/Attachment";
import HtmlMessage, { looksLikeHtml } from "@/components/HtmlMessage";
import type { ChannelPost } from "@/lib/channelTypes";

interface Props {
  posts: ChannelPost[];
  loading: boolean;
}

function toProperCase(str?: string | null): string {
  if (!str) return "Admin";
  return str
    .toLowerCase()
    .split(/(\s+)/)
    .map((p) => (p.trim().length === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function formatDateLabel(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today.getTime() - that.getTime()) / 86400000;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function initials(name: string) {
  return (name || "A").slice(0, 2).toUpperCase();
}

export default function ChannelPosts({ posts, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [posts.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No posts yet.
      </div>
    );
  }

  let lastDate = "";

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-3">
        {posts.map((p) => {
          const dateLabel = formatDateLabel(p.created_at);
          const showDate = dateLabel !== lastDate;
          lastDate = dateLabel;
          const senderName = toProperCase(p.sender_name);

          return (
            <div key={p.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-xs px-3 py-1 rounded-full bg-card text-muted-foreground border">
                    {dateLabel}
                  </span>
                </div>
              )}

              <article className="bg-card rounded-2xl shadow-sm border p-3">
                <header className="flex items-center gap-2 mb-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-[10px]">
                      {initials(senderName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{senderName}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatTime(p.created_at)}
                  </span>
                </header>

                {p.file && (
                  <div className="mb-2">
                    <Attachment
                      file={p.file}
                      isMe={false}
                      uploading={p.uploading}
                      uploadError={p.upload_error}
                    />
                  </div>
                )}

                {p.message && (
                  <p className="text-sm whitespace-pre-wrap break-words text-foreground">
                    {p.message}
                  </p>
                )}
              </article>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
