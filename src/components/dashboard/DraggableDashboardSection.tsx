import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WidgetSize = 3 | 4 | 6 | 8 | 12;

const SIZE_OPTIONS: { span: WidgetSize; label: string; shortLabel: string }[] = [
  { span: 3, label: '1/4 width', shortLabel: 'S' },
  { span: 4, label: '1/3 width', shortLabel: 'M' },
  { span: 6, label: '1/2 width', shortLabel: 'L' },
  { span: 12, label: 'Full width', shortLabel: 'XL' },
];

interface DraggableDashboardSectionProps {
  id: string;
  children: ReactNode;
  isDraggable: boolean;
  label?: string;
  className?: string;
  isEditMode?: boolean;
  onRemove?: () => void;
  currentSpan?: number;
  onResize?: (span: WidgetSize) => void;
}

/**
 * DraggableDashboardSection — tile wrapper for the dashboard canvas.
 * View mode is completely clean: no rings, handles or labels.
 * Edit mode adds an inline toolbar (grip, name, remove) and a segmented
 * size control docked to the tile, so nothing floats outside the grid.
 * Drag/reorder/resize logic and handlers are unchanged.
 */
export function DraggableDashboardSection({ id, children, isDraggable, label, className = '', isEditMode, onRemove, currentSpan, onResize }: DraggableDashboardSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  if (!isEditMode) {
    return (
      <div ref={setNodeRef} style={style} className={cn('relative h-full min-w-0', className)}>
        <div className="h-full">{children}</div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={cn('relative h-full min-w-0', className)}>
      <div
        className={cn(
          'group relative flex h-full min-w-0 flex-col gap-1.5 rounded-xl p-1.5 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none',
          'bg-primary/[0.04] ring-1 ring-dashed ring-primary/40',
          isDragging && 'opacity-50 ring-2 ring-primary'
        )}
      >
      {/* Edit toolbar — docked, never floating outside the grid cell */}
      <div className="flex min-w-0 items-center gap-1 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={label ? `Drag to reorder ${label}` : 'Drag to reorder widget'}
          title={label ? `Drag to reorder: ${label}` : 'Drag to reorder'}
          className="inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {label && (
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
            {label}
          </span>
        )}
        {onResize && (
          <div
            className="flex shrink-0 items-center rounded-md border border-border bg-card p-0.5"
            role="group"
            aria-label={label ? `Size for ${label}` : 'Widget size'}
          >
            {SIZE_OPTIONS.map(opt => {
              const isActive = currentSpan === opt.span;
              return (
                <button
                  key={opt.span}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onResize(opt.span); }}
                  aria-pressed={isActive}
                  title={opt.label}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={label ? `Remove ${label}` : 'Remove widget'}
            title={label ? `Remove ${label}` : 'Remove widget'}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
