import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useLocation } from 'react-router-dom';
import { SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { GripVertical } from 'lucide-react';

interface SidebarItem {
  id: string;
  title: string;
  url: string;
  icon: any;
  color: string;
  bgColor: string;
  permissions: string[];
}

interface DraggableSidebarItemProps {
  item: SidebarItem;
  isCollapsed: boolean;
  isDragMode: boolean;
}

export function DraggableSidebarItem({ item, isCollapsed, isDragMode }: DraggableSidebarItemProps) {
  const location = useLocation();
  const isActive = location.pathname === item.url;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <SidebarMenuItem ref={setNodeRef} style={style}>
      <SidebarMenuButton 
        asChild 
        className={`
          hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-xl group border-2 border-transparent hover:border-gray-200 shadow-sm hover:shadow-md
          ${isActive ? 'bg-blue-50 text-blue-700 font-semibold shadow-md border-blue-200 transform translate-x-1' : ''}
          ${isDragMode ? 'cursor-grab active:cursor-grabbing' : ''}
          ${isDragging ? 'opacity-50 z-50' : ''}
        `}
      >
        <div className="flex items-center gap-3 px-3 py-3 w-full">
          {isDragMode && !isCollapsed && (
            <div 
              {...attributes}
              {...listeners}
              className="touch-none flex-shrink-0 p-1 hover:bg-gray-200 rounded transition-colors cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.preventDefault()}
            >
              <GripVertical className="h-4 w-4 text-gray-400" />
            </div>
          )}
          <Link to={item.url} className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100' : item.bgColor} transition-all duration-200 flex-shrink-0`}>
              <item.icon className={`h-4 w-4 ${isActive ? 'text-blue-700' : item.color} transition-colors duration-200`} />
            </div>
            {!isCollapsed && (
              <span className="font-medium text-sm truncate transition-all duration-200 flex-1">
                {item.title}
              </span>
            )}
          </Link>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}