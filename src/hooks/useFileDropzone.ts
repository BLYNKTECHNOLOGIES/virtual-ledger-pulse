import { useCallback, useRef, useState } from "react";

interface UseFileDropzoneOptions {
  /** Called with the dropped files. */
  onFiles: (files: File[]) => void;
  /** When true, drag-and-drop is ignored. */
  disabled?: boolean;
  /** Allow more than one file. Defaults to true. */
  multiple?: boolean;
}

/**
 * Reusable drag-and-drop file handling.
 * Spread `dropzoneProps` onto the element that should accept dropped files
 * and use `isDragActive` to render a highlight state.
 */
export function useFileDropzone({ onFiles, disabled = false, multiple = true }: UseFileDropzoneOptions) {
  const [isDragActive, setIsDragActive] = useState(false);
  // Track nested dragenter/dragleave so the highlight doesn't flicker over children.
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current += 1;
      setIsDragActive(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setIsDragActive(false);
      }
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  return {
    isDragActive,
    dropzoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
