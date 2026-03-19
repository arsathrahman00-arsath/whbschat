import { useRef, useState } from "react";
import { Plus, User } from "lucide-react";

interface AvatarUploadProps {
  onFileSelect: (file: File) => void;
  error?: string;
}

export function AvatarUpload({ onFileSelect, error }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onFileSelect(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative h-24 w-24 rounded-full border-2 border-dashed border-input bg-surface flex items-center justify-center overflow-hidden transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {preview ? (
          <img src={preview} alt="Profile preview" className="h-full w-full object-cover" />
        ) : (
          <User className="h-10 w-10 text-muted-foreground" />
        )}
        <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <span className="text-xs font-medium text-muted-foreground">Profile Photo</span>
      {error && <span className="text-xs text-destructive animate-fade-in">{error}</span>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}
