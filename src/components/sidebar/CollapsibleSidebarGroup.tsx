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
      <Collapsible open={isExpanded && isUnlocked && !isDragMode} onOpenChange={setIsExpanded}>
        <SidebarMenuItem ref={setNodeRef} style={style} className={isDragging ? 'relative z-50' : ''}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              onClick={handleToggle}
              className={`
                hover:bg-muted/10 text-muted-foreground hover:text-foreground transition-all duration-200 rounded-xl group border border-transparent hover:border-muted/20 shadow-sm hover:shadow-md
                ${hasActiveChild ? 'bg-info/10 text-info font-semibold shadow-md border-info/20' : ''}
                ${isDragMode ? 'cursor-default' : 'cursor-pointer'}
                ${isDragging ? 'opacity-50 z-50' : ''}
                ${isCollapsed ? 'justify-center' : ''}
              `}
            >
              <div className={`flex items-center w-full ${isCollapsed ? 'justify-center px-1 py-3' : 'gap-2 px-3 py-3'}`}>
                {isDragMode && !isCollapsed && (
                  <div
                    {...attributes}
                    {...listeners}
                    className="touch-none flex-shrink-0 p-1.5 hover:bg-info/10 bg-muted/10 rounded-lg transition-colors cursor-grab active:cursor-grabbing border border-muted/20"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className={`flex items-center flex-1 min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isDragMode ? 'pointer-events-none' : ''}`}>
                  <div className={`p-2 rounded-lg ${hasActiveChild ? 'bg-info/10' : group.bgColor} transition-all duration-200 flex-shrink-0 ${isCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''}`}>
                    <GroupIcon className={`h-4 w-4 ${hasActiveChild ? 'text-info' : group.color} transition-colors duration-200`} />
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className="font-medium text-sm truncate transition-all duration-200 flex-1">
                        {group.title}
                      </span>
                      <div className={`flex items-center gap-1 flex-shrink-0 ${isDragMode ? 'hidden' : ''}`}>
                        {group.pinProtected && (
                          isUnlocked ? (
                            <LockOpen className="h-3 w-3 text-success" />
                          ) : (
                            <Lock className="h-3 w-3 text-warning" />
                          )
                        )}
                        {isExpanded && isUnlocked ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="pl-4">
            {group.children.map((item) => {
              const ItemIcon = item.icon;
              const isExternal = item.url.startsWith('http');
              const isActive = !isExternal && location.pathname === item.url;
              
              const linkContent = (
                <div className="flex items-center gap-2 px-2 py-2">
                  <div className={`p-1.5 rounded-md ${isActive ? 'bg-info/10' : item.bgColor} transition-all duration-200`}>
                    <ItemIcon className={`h-3.5 w-3.5 ${isActive ? 'text-info' : item.color}`} />
                  </div>
                  <span className="text-sm truncate">{item.title}</span>
                </div>
              );

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    className={`
                      hover:bg-muted/10 text-muted-foreground hover:text-foreground transition-all duration-200 rounded-lg group border border-transparent hover:border-muted/20 my-0.5
                      ${isActive ? 'bg-info/10 text-info font-medium border-info/20' : ''}
                    `}
                  >
                    {isExternal ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {linkContent}
                      </a>
                    ) : (
                      <Link to={item.url}>
                        {linkContent}
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
