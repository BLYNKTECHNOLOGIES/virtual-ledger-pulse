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
  } = useSortable({ 
    id: item.id,
    disabled: !isDragMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <SidebarMenuItem 
      ref={setNodeRef} 
      style={style}
      className={isDragging ? 'relative z-50' : ''}
    >
      <SidebarMenuButton
        tooltip={isCollapsed ? item.title : undefined}
        className={`
          hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground transition-all duration-150 rounded-xl group border border-transparent hover:border-sidebar-border hover:shadow-sm
          ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-sidebar-border shadow-sm' : ''}
          ${isDragging ? 'opacity-50 z-50' : ''}
          ${isCollapsed ? 'justify-center' : ''}
        `}
      >
        <div className={`flex items-center w-full ${isCollapsed ? 'justify-center px-1 py-3' : 'gap-2 px-3 py-3'}`}>
          {isDragMode && !isCollapsed && (
            <div 
              {...attributes}
              {...listeners}
              className="touch-none flex-shrink-0 p-1.5 hover:bg-blue-100 bg-gray-100 rounded-lg transition-colors cursor-grab active:cursor-grabbing border border-gray-200"
            >
              <GripVertical className="h-4 w-4 text-gray-600" />
            </div>
          )}
          <Link 
            to={isDragMode ? '#' : item.url} 
            onClick={(e) => isDragMode && e.preventDefault()}
            className={`flex items-center flex-1 min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isDragMode ? 'pointer-events-none' : ''}`}
          >
            <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100' : item.bgColor} transition-all duration-200 flex-shrink-0 ${isCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''}`}>
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