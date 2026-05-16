// Fetches a protected media URL with the JWT token and exposes a blob
// object URL for use in <img>/<video>/<a download> elements.
// Cleans up via URL.revokeObjectURL on unmount / url change.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth";

export type AuthedMediaState = "idle" | "loading" | "ready" | "unauthorized" | "error";

export interface UseAuthedMediaResult {
  objectUrl: string;
  state: AuthedMediaState;
  error?: string;
}

export function useAuthedMedia(url: string | undefined | null): UseAuthedMediaResult {
  const [objectUrl, setObjectUrl] = useState("");
  const [state, setState] = useState<AuthedMediaState>("idle");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!url) {
      setObjectUrl("");
      setState("idle");
      return;
    }

    let cancelled = false;
    let createdUrl = "";
    setState("loading");
    setError(undefined);

    (async () => {
      try {
        const res = await apiFetch(url, { logoutOn401: false });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setState("unauthorized");
            setError("Unauthorized");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setState("ready");
      } catch (e) {
        if (!cancelled) {
          setState("error");
          setError(e instanceof Error ? e.message : "Failed to load media");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return { objectUrl, state, error };
}

/** One-shot authenticated download that triggers a Save As via blob URL. */
export async function downloadAuthedFile(url: string, filename: string): Promise<void> {
  const res = await apiFetch(url, { logoutOn401: false });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}