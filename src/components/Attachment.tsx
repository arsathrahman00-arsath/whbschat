import { useState } from "react";
import { Play, FileText, Download, X, AlertCircle, Loader2 } from "lucide-react";
import { formatFileSize, type ChatAttachment } from "@/lib/chatMessage";

interface AttachmentProps {
  file: ChatAttachment;
  isMe: boolean;
  uploading?: boolean;
  uploadError?: string | null;
}

export default function Attachment({ file, isMe, uploading, uploadError }: AttachmentProps) {
  const [lightbox, setLightbox] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const stateOverlay = (uploading || uploadError) && (
    <div className="absolute inset-0 bg-black/45 flex items-center justify-center rounded-[14px]">
      {uploadError ? (
        <div className="flex items-center gap-1 text-white text-xs font-medium">
          <AlertCircle className="h-4 w-4" /> Failed
        </div>
      ) : (
        <Loader2 className="h-6 w-6 text-white animate-spin" />
      )}
    </div>
  );

  if (file.message_type === "image") {
    return (
      <>
        <div className="relative max-w-[260px] animate-fade-in">
          {file.url ? (
            <img
              src={file.url}
              alt={file.name}
              loading="lazy"
              onClick={() => !uploading && !uploadError && setLightbox(true)}
              className="rounded-[14px] w-full h-auto cursor-pointer object-cover transition-opacity"
            />
          ) : (
            <div className="rounded-[14px] w-[220px] h-[160px] bg-black/10 animate-pulse" />
          )}
          {stateOverlay}
        </div>
        {lightbox && file.url && (
          <div
            className="fixed inset-0 z-[10001] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={file.url}
              alt={file.name}
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (file.message_type === "video") {
    return (
      <>
        <div className="relative max-w-[260px] animate-fade-in">
          <div
            onClick={() => !uploading && !uploadError && file.url && setVideoOpen(true)}
            className="relative rounded-[14px] overflow-hidden bg-black cursor-pointer aspect-video"
          >
            {file.url ? (
              <video src={file.url} preload="metadata" muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-black/20 animate-pulse" />
            )}
            {!uploading && !uploadError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                  <Play className="h-6 w-6 text-white fill-white ml-0.5" />
                </div>
              </div>
            )}
          </div>
          {stateOverlay}
        </div>
        {videoOpen && file.url && (
          <div
            className="fixed inset-0 z-[10001] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setVideoOpen(false)}
          >
            <button
              onClick={() => setVideoOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <video
              src={file.url}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  // Document
  return (
    <div className="min-w-[220px] max-w-[280px] animate-fade-in">
      <div
        className={`flex items-center gap-3 p-2 rounded-[12px] transition-colors ${
          isMe ? "hover:bg-white/10" : "hover:bg-black/5"
        }`}
      >
        <div className="h-11 w-11 rounded-full bg-[#3390ec] text-white flex items-center justify-center flex-shrink-0">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : uploadError ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-medium truncate ${isMe ? "text-white" : "text-foreground"}`}>
            {file.name || "File"}
          </p>
          <p className={`text-[12px] ${isMe ? "text-white/70" : "text-muted-foreground"}`}>
            {uploading ? "Uploading…" : uploadError ? uploadError : formatFileSize(file.size || 0)}
          </p>
        </div>
        {!uploading && !uploadError && file.url && (
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            download={file.name}
            onClick={(e) => e.stopPropagation()}
            className={`p-2 rounded-full flex-shrink-0 ${
              isMe ? "text-white hover:bg-white/10" : "text-[#3390ec] hover:bg-[#3390ec]/10"
            }`}
            aria-label="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
