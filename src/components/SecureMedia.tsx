// Reusable JWT-authenticated media components.
// All three wrap useAuthedMedia / downloadAuthedFile so that no protected
// asset is ever rendered via a direct <img src> / <video src> that would
// hit the backend without an Authorization header.

import { useAuthedMedia, downloadAuthedFile } from "@/lib/useAuthedMedia";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { useState } from "react";

interface SecureImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
  fallbackClassName?: string;
}

export function SecureImage({ url, alt, className, fallbackClassName, ...rest }: SecureImageProps) {
  const { objectUrl, state } = useAuthedMedia(url);
  if (state === "loading" || state === "idle") {
    return (
      <div className={fallbackClassName || `${className || ""} flex items-center justify-center bg-black/10`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state !== "ready" || !objectUrl) {
    return (
      <div className={fallbackClassName || `${className || ""} flex items-center justify-center bg-black/10`}>
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
    );
  }
  return <img src={objectUrl} alt={alt} className={className} {...rest} />;
}

interface SecureVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  url: string;
  fallbackClassName?: string;
}

export function SecureVideo({ url, className, fallbackClassName, ...rest }: SecureVideoProps) {
  const { objectUrl, state } = useAuthedMedia(url);
  if (state === "loading" || state === "idle") {
    return (
      <div className={fallbackClassName || `${className || ""} flex items-center justify-center bg-black/10`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state !== "ready" || !objectUrl) {
    return (
      <div className={fallbackClassName || `${className || ""} flex items-center justify-center bg-black/10`}>
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
    );
  }
  return <video src={objectUrl} className={className} {...rest} />;
}

interface SecureDocumentDownloadProps {
  url: string;
  filename: string;
  children?: React.ReactNode;
  className?: string;
}

export function SecureDocumentDownload({
  url,
  filename,
  children,
  className,
}: SecureDocumentDownloadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(false);
    try {
      await downloadAuthedFile(url, filename);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={handle} className={className} aria-label={`Download ${filename}`}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : error ? (
        <AlertCircle className="h-4 w-4 text-destructive" />
      ) : (
        children ?? <Download className="h-4 w-4" />
      )}
    </button>
  );
}