import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Columns2, Columns3, Columns4, Maximize2 } from "lucide-react";
import { ReactNode } from "react";

export type WidgetSize = 3 | 4 | 6 | 8 | 12;

const SIZE_OPTIONS: { span: WidgetSize; label: string; icon: any; shortLabel: string }[] = [
  { span: 3, label: '1/4 width', icon: Columns4, shortLabel: 'S' },
  { span: 4, label: '1/3 width', icon: Columns3, shortLabel: 'M' },
  { span: 6, label: '1/2 width', icon: Columns2, shortLabel: 'L' },
  { span: 12, label: 'Full width', icon: Maximize2, shortLabel: 'XL' },
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative group h-full ${className} ${isDragging ? 'ring-2 ring-blue-400 rounded-xl' : ''} ${isEditMode ? 'ring-1 ring-dashed ring-amber-300 rounded-xl' : ''}`}>
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-blue-600 text-white rounded-lg cursor-grab active:cursor-grabbing shadow-lg hover:bg-blue-700 transition-colors"
          title={label ? `Drag to reorder: ${label}` : 'Drag to reorder'}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {isEditMode && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -right-2 -top-2 z-20 p-1 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
          title={label ? `Remove ${label}` : 'Remove widget'}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {isEditMode && label && (
        <div className="absolute -top-3 left-3 z-10 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full border border-amber-200">
          {label}
        </div>
      )}
      {/* Resize controls — bottom-right in edit mode */}
      {isEditMode && onResize && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full shadow-lg px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {SIZE_OPTIONS.map(opt => {
            const isActive = currentSpan === opt.span;
            return (
              <button
                key={opt.span}
                onClick={(e) => { e.stopPropagation(); onResize(opt.span); }}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`}
                title={opt.label}
              >
                {opt.shortLabel}
              </button>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
