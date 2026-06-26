import { useRef } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileDropzone } from "@/hooks/useFileDropzone";

interface FileDropzoneProps {
  /** Called with selected/dropped files. */
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  /** Main label, e.g. "Drag & drop or click to upload". */
  label?: React.ReactNode;
  /** Secondary hint, e.g. "PDF, JPG or PNG. Max 5MB". */
  hint?: React.ReactNode;
  /** Optional custom content rendered inside the dropzone. */
  children?: React.ReactNode;
}

/**
 * A clickable + drag-and-drop file picker. Use as a drop-in replacement for
 * a hidden `<input type="file">` + button pattern.
 */
export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  className,
  label = "Drag & drop or click to upload",
  hint,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDragActive, dropzoneProps } = useFileDropzone({ onFiles, disabled, multiple });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
    // reset so selecting the same file again re-triggers change
    e.target.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      {...dropzoneProps}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-6 text-center transition-colors",
        !disabled && "cursor-pointer hover:border-muted-foreground/40 hover:bg-muted/50",
        isDragActive && "border-primary bg-primary/10",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={handleChange}
      />
      {children ?? (
        <>
          <Upload className={cn("h-6 w-6 text-muted-foreground", isDragActive && "text-primary")} />
          <span className="text-sm font-medium text-foreground">{label}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </>
      )}
    </div>
  );
}
