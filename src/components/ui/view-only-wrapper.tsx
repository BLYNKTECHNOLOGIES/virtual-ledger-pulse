import React from 'react';
import { cn } from '@/lib/utils';

interface ViewOnlyWrapperProps {
  children: React.ReactNode;
  isViewOnly?: boolean;
  className?: string;
}

export const ViewOnlyWrapper: React.FC<ViewOnlyWrapperProps> = ({
  children,
  isViewOnly = false,
  className = ""
}) => {
  if (!isViewOnly) {
    return <>{children}</>;
  }

  return (
    <div 
      className={cn(
        "relative", 
        className
      )}
    >
      {/* Overlay to prevent interaction */}
      <div className="absolute inset-0 bg-gray-100/50 backdrop-blur-[0.5px] z-10 rounded-md" />
      
      {/* Grayed out content */}
      <div className={cn(
        "opacity-60 pointer-events-none select-none",
        "grayscale-[0.3]"
      )}>
        {children}
      </div>
      
      {/* View Only Badge */}
      <div className="absolute top-2 right-2 z-20">
        <span className="bg-gray-500 text-white text-xs px-2 py-1 rounded-md font-medium shadow-sm">
          View Only
        </span>
      </div>
    </div>
  );
};