import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResponseBannerProps {
  message: string;
  type: "success" | "error";
}

export function ResponseBanner({ message, type }: ResponseBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium animate-fade-in",
        type === "success" && "bg-accent/10 text-accent",
        type === "error" && "bg-destructive/10 text-destructive"
      )}
    >
      {type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}
