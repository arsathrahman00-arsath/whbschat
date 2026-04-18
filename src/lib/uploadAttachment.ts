// Upload a file to /chat/upload_file/ and return a normalized attachment.
// Contract:
//   POST FormData(file, sender_id) -> { file_id, file_name, mime_type, file_size, message_type }
// We tolerate small variations in the response shape and always return a
// ChatAttachment ready to be embedded in a ChatMessage.

import { buildFileUrl, kindFromMime, type AttachmentKind, type ChatAttachment } from "./chatMessage";

const UPLOAD_URL = "https://ngrchatbot.whindia.in/chat/upload_file/";

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export function uploadAttachment(
  file: File,
  currentUserId: string | number,
  opts: UploadOptions = {},
): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("sender_id", String(currentUserId));

    xhr.open("POST", UPLOAD_URL);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload failed (${xhr.status})`));
        return;
      }
      try {
        const json = JSON.parse(xhr.responseText);
        const data = json.data || json;
        const fileId = String(data.file_id ?? data.id ?? "");
        if (!fileId && !data.file_url && !data.url) {
          reject(new Error("Upload response missing file_id"));
          return;
        }
        const mime = data.mime_type || data.file_type || file.type || "";
        const kind: AttachmentKind = (data.message_type as AttachmentKind) || kindFromMime(mime);
        const url = data.file_url || data.url || buildFileUrl(fileId);
        resolve({
          id: fileId,
          name: data.file_name || file.name,
          mime_type: mime,
          size: Number(data.file_size ?? file.size),
          message_type: kind,
          url,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Invalid upload response"));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(form);
  });
}
