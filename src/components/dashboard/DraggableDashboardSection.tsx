import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { ReactNode } from "react";

interface DraggableDashboardSectionProps {
  id: string;
  children: ReactNode;
  isDraggable: boolean;
  label?: string;
  className?: string;
  isEditMode?: boolean;
  onRemove?: () => void;
}

export function DraggableDashboardSection({ id, children, isDraggable, label, className = '', isEditMode, onRemove }: DraggableDashboardSectionProps) {
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
    <div ref={setNodeRef} style={style} className={`relative group ${className} ${isDragging ? 'ring-2 ring-blue-400 rounded-xl' : ''} ${isEditMode ? 'ring-1 ring-dashed ring-amber-300 rounded-xl' : ''}`}>
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
      {children}
    </div>
  );
}
