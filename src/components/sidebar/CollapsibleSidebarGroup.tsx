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
                hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all duration-200 rounded-xl group border-2 border-transparent hover:border-gray-200 shadow-sm hover:shadow-md
                ${hasActiveChild ? 'bg-blue-50 text-blue-700 font-semibold shadow-md border-blue-200' : ''}
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
                    className="touch-none flex-shrink-0 p-1.5 hover:bg-blue-100 bg-gray-100 rounded-lg transition-colors cursor-grab active:cursor-grabbing border border-gray-200"
                  >
                    <GripVertical className="h-4 w-4 text-gray-600" />
                  </div>
                )}
                <div className={`flex items-center flex-1 min-w-0 ${isCollapsed ? 'justify-center' : 'gap-3'} ${isDragMode ? 'pointer-events-none' : ''}`}>
                  <div className={`p-2 rounded-lg ${hasActiveChild ? 'bg-blue-100' : group.bgColor} transition-all duration-200 flex-shrink-0 ${isCollapsed ? 'w-8 h-8 flex items-center justify-center' : ''}`}>
                    <GroupIcon className={`h-4 w-4 ${hasActiveChild ? 'text-blue-700' : group.color} transition-colors duration-200`} />
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className="font-medium text-sm truncate transition-all duration-200 flex-1">
                        {group.title}
                      </span>
                      <div className={`flex items-center gap-1 flex-shrink-0 ${isDragMode ? 'hidden' : ''}`}>
                        {group.pinProtected && (
                          isUnlocked ? (
                            <LockOpen className="h-3 w-3 text-green-500" />
                          ) : (
                            <Lock className="h-3 w-3 text-amber-500" />
                          )
                        )}
                        {isExpanded && isUnlocked ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
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
                  <div className={`p-1.5 rounded-md ${isActive ? 'bg-blue-100' : item.bgColor} transition-all duration-200`}>
                    <ItemIcon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-700' : item.color}`} />
                  </div>
                  <span className="text-sm truncate">{item.title}</span>
                </div>
              );

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    className={`
                      hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-all duration-200 rounded-lg group border border-transparent hover:border-gray-100 my-0.5
                      ${isActive ? 'bg-blue-50 text-blue-700 font-medium border-blue-100' : ''}
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
