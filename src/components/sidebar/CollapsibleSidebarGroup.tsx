import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, useLocation } from 'react-router-dom';
import { SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, GripVertical, Lock, LockOpen } from 'lucide-react';
import { PinProtectionDialog } from './PinProtectionDialog';
import { usePinUnlock } from '@/contexts/PinUnlockContext';
import { LucideIcon } from 'lucide-react';

export interface SidebarGroupItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  permissions: string[];
}

export interface SidebarGroupConfig {
  id: string;
  title: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  pinProtected?: boolean;
  pinCode?: string;
  children: SidebarGroupItem[];
}

interface CollapsibleSidebarGroupProps {
  group: SidebarGroupConfig;
  isCollapsed: boolean;
  isDragMode: boolean;
}

export function CollapsibleSidebarGroup({
  group,
  isCollapsed,
  isDragMode,
}: CollapsibleSidebarGroupProps) {
  const location = useLocation();
  const { isGroupUnlocked, unlockGroup } = usePinUnlock();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);

  const isUnlocked = !group.pinProtected || isGroupUnlocked(group.id);
  const hasActiveChild = group.children.some(child => location.pathname === child.url);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: group.id,
    disabled: !isDragMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const handleToggle = () => {
    // Don't toggle if in drag mode
    if (isDragMode) return;
    
    if (!isUnlocked) {
      setShowPinDialog(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handlePinSuccess = () => {
    unlockGroup(group.id);
    setIsExpanded(true);
  };

  const GroupIcon = group.icon;

  return (
    <>
      <Collapsible open={isExpanded && isUnlocked && !isDragMode && !isCollapsed} onOpenChange={setIsExpanded}>
        <SidebarMenuItem ref={setNodeRef} style={style} className={`${isDragging ? 'relative z-50' : ''} ${isCollapsed ? 'w-8' : ''}`}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              onClick={handleToggle}
              tooltip={isCollapsed ? group.title : undefined}
              className={`h-auto p-0 hover:bg-transparent group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 ${isDragMode ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div
                className="ds-nav-row"
                data-collapsed={isCollapsed}
                data-contains-active={hasActiveChild}
                title={isCollapsed ? undefined : group.title}
              >
                {isDragMode && !isCollapsed && (
                  <span
                    {...attributes}
                    {...listeners}
                    className="-ml-1 flex cursor-grab touch-none items-center rounded p-0.5 text-muted-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                )}
                <span className={`ds-nav-icon ${group.bgColor} ${group.color}`}>
                  <GroupIcon className="h-4 w-4" />
                </span>
                {!isCollapsed && (
                  <>
                    <span className={`ds-nav-label ${isExpanded && isUnlocked ? 'ds-nav-grouplabel' : ''}`}>
                      {group.title}
                    </span>
                    <span className={`flex flex-shrink-0 items-center gap-1 ${isDragMode ? 'hidden' : ''}`}>
                      {group.pinProtected && (
                        isUnlocked ? (
                          <LockOpen className="h-3 w-3 text-success" />
                        ) : (
                          <Lock className="h-3 w-3 text-warning" />
                        )
                      )}
                      {isExpanded && isUnlocked ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </span>
                  </>
                )}
              </div>
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <CollapsibleContent className="ds-nav-children mt-0.5 space-y-0.5">
            {group.children.map((item) => {
              const ItemIcon = item.icon;
              const isExternal = item.url.startsWith('http');
              const isActive = !isExternal && location.pathname === item.url;

              const inner = (
                <>
                  <span className={`ds-nav-icon ${item.bgColor} ${item.color}`}>
                    <ItemIcon className="h-4 w-4" />
                  </span>
                  <span className="ds-nav-label">{item.title}</span>
                </>
              );

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                    {isExternal ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ds-nav-row"
                        title={item.title}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link to={item.url} className="ds-nav-row" data-active={isActive} title={item.title}>
                        {inner}
                      </Link>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>

      <PinProtectionDialog
        open={showPinDialog}
        onOpenChange={setShowPinDialog}
        groupName={group.title}
        pinCode={group.pinCode || ''}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}
