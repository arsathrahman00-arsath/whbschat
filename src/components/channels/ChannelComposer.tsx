// Admin-only composer. Mirrors direct-chat compose UX:
//   - text input
//   - file upload via paperclip (image/video/document)
//   - small preview before send
// File is uploaded first, then file_id is sent over the channel WebSocket.
//
// Non-admins see a disabled, read-only state with a "View only" hint and
// the message: "Only admin can post in this channel".

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, Loader2, FileText, Film, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kindFromMime, formatFileSize, type ChatAttachment } from "@/lib/chatMessage";
import { uploadAttachment } from "@/lib/uploadAttachment";
import { toast } from "sonner";

interface Props {
  canPost: boolean;
  currentUserId: string | number;
  onSend: (text: string, file: ChatAttachment | null) => boolean;
  /** Changes whenever the active channel changes — used to re-focus input. */
  focusKey?: string | number;
}

export default function ChannelComposer({ canPost, currentUserId, onSend, focusKey }: Props) {
  const [text, setText] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the message input when the channel changes (and on mount).
  useEffect(() => {
    if (canPost) {
      inputRef.current?.focus();
    }
  }, [canPost, focusKey]);

  // Non-admin: read-only composer with clear messaging.
  if (!canPost) {
    return (
      <div className="border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/40">
          <Lock className="h-3.5 w-3.5" />
          <span>Only admin can post in this channel</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            disabled
            aria-label="Attachments disabled"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            value=""
            readOnly
            disabled
            placeholder="View only — only admin can post"
            className="flex-1 cursor-not-allowed"
            onClick={() => toast.error("Only admin can post in this channel")}
          />
          <span className="text-xs font-medium text-muted-foreground px-2 select-none">
            View only
          </span>
        </div>
      </div>
    );
  }

  const pickFile = (file: File) => {
    setPreviewFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    const caption = text.trim();
    if (!caption && !previewFile) return;

    let attachment: ChatAttachment | null = null;
    if (previewFile) {
      setUploading(true);
      try {
        attachment = await uploadAttachment(previewFile, currentUserId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const ok = onSend(caption, attachment);
    if (!ok) {
      toast.error("Channel not connected");
      return;
    }

    setText("");
    clearPreview();
  };

  const previewKind = previewFile ? kindFromMime(previewFile.type) : null;

  return (
    <div className="border-t bg-card pb-[env(safe-area-inset-bottom)]">
      {previewFile && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3 bg-muted rounded-lg p-2 pr-3">
            {previewKind === "image" && previewUrl ? (
              <img src={previewUrl} alt="" className="h-12 w-12 rounded object-cover" />
            ) : previewKind === "video" && previewUrl ? (
              <div className="relative h-12 w-12 rounded bg-black/80 flex items-center justify-center">
                <Film className="h-5 w-5 text-white" />
              </div>
            ) : (
              <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{previewFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(previewFile.size)}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearPreview}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3">
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Broadcast a message…"
          className="flex-1"
          disabled={uploading}
          autoFocus
        />
        <Button
          onClick={handleSubmit}
          disabled={uploading || (!text.trim() && !previewFile)}
          className="h-9 px-3"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
