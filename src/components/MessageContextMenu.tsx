import { useEffect, useRef } from "react";
import { Reply, Forward, Copy, Trash2 } from "lucide-react";

interface MessageContextMenuProps {
  x: number;
  y: number;
  isMe: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function MessageContextMenu({
  x,
  y,
  isMe,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 9999,
  };

  const items = [
    { label: "Reply", icon: Reply, action: onReply },
    { label: "Forward", icon: Forward, action: onForward },
    { label: "Copy", icon: Copy, action: onCopy },
    { label: "Delete", icon: Trash2, action: onDelete },
  ];

  return (
    <div ref={menuRef} style={style} className="bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[150px] animate-in fade-in-0 zoom-in-95 duration-150">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose(); }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
            item.label === "Delete" ? "text-red-500" : "text-gray-700"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
