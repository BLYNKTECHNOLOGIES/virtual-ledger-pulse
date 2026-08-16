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

  const Icon = item.icon;

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'relative z-50' : ''} ${isCollapsed ? 'flex justify-center' : ''}`}
    >
      <SidebarMenuButton
        asChild={!isDragMode}
        tooltip={isCollapsed ? item.title : undefined}
        className="h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0"
      >
        {isDragMode ? (
          <div className="ds-nav-row" data-collapsed={isCollapsed} data-active={isActive}>
            {!isCollapsed && (
              <span
                {...attributes}
                {...listeners}
                className="-ml-1 flex cursor-grab touch-none items-center rounded p-0.5 text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </span>
            )}
            <span className="ds-nav-icon">
              <Icon className="h-4 w-4" />
            </span>
            {!isCollapsed && <span className="ds-nav-label">{item.title}</span>}
          </div>
        ) : (
          <Link
            to={item.url}
            title={isCollapsed ? undefined : item.title}
            aria-label={item.title}
            className="ds-nav-row"
            data-collapsed={isCollapsed}
            data-active={isActive}
          >
            <span className="ds-nav-icon">
              <Icon className="h-4 w-4" />
            </span>
            {!isCollapsed && <span className="ds-nav-label">{item.title}</span>}
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
