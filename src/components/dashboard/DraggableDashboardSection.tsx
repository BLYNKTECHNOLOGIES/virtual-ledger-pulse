import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ReactNode } from "react";

interface DraggableDashboardSectionProps {
  id: string;
  children: ReactNode;
  isDraggable: boolean;
  label?: string;
  className?: string;
}

export function DraggableDashboardSection({ id, children, isDraggable, label, className = '' }: DraggableDashboardSectionProps) {
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
    <div ref={setNodeRef} style={style} className={`relative ${className} ${isDragging ? 'ring-2 ring-blue-400 rounded-xl' : ''}`}>
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
      {children}
    </div>
  );
}
