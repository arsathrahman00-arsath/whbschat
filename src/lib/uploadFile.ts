// File upload helper with progress tracking via XHR.
// Backend contract: POST FormData('file') -> { file_url, file_name, file_size, file_type }

const UPLOAD_URL = "https://ngrchatbot.whindia.in/chat/upload_file/";

export interface UploadedFile {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export type MediaType = "image" | "video" | "document";

export function detectMediaType(file: File | { type?: string; name?: string }): MediaType {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  extraFields?: Record<string, string | number>;
}

export function uploadFile(file: File, opts: UploadOptions = {}): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    if (opts.extraFields) {
      for (const [k, v] of Object.entries(opts.extraFields)) form.append(k, String(v));
    }

    xhr.open("POST", UPLOAD_URL);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          // Tolerate variations in response shape
          const data: UploadedFile = {
            file_url: json.file_url || json.url || json.data?.file_url || json.data?.url || "",
            file_name: json.file_name || json.name || file.name,
            file_size: json.file_size || json.size || file.size,
            file_type: json.file_type || json.type || file.type,
          };
          if (!data.file_url) reject(new Error("Upload response missing file_url"));
          else resolve(data);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
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
