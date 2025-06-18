
import { Button } from "@/components/ui/button";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MinimizedDialogIconProps {
  title: string;
  type: 'sales' | 'purchase' | 'other';
  onClick: () => void;
  onRemove: () => void;
  index: number;
}

export function MinimizedDialogIcon({ title, type, onClick, onRemove, index }: MinimizedDialogIconProps) {
  const getIcon = () => {
    switch (type) {
      case 'sales':
        return <FileText className="h-4 w-4" />;
      case 'purchase':
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getColor = () => {
    switch (type) {
      case 'sales':
        return 'bg-green-500 hover:bg-green-600';
      case 'purchase':
        return 'bg-blue-500 hover:bg-blue-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  return (
    <div 
      className={cn(
        "fixed z-50 flex items-center gap-2 transition-all duration-200",
        "bottom-4 left-4"
      )}
      style={{ 
        transform: `translateY(${-index * 60}px)` 
      }}
    >
      <Button
        onClick={onClick}
        className={cn(
          "w-12 h-12 rounded-full shadow-lg text-white border-2 border-white",
          getColor()
        )}
        title={title}
      >
        {getIcon()}
      </Button>
      <Button
        onClick={onRemove}
        variant="outline"
        size="sm"
        className="w-6 h-6 rounded-full p-0 bg-red-500 hover:bg-red-600 text-white border-red-500"
        title="Close"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
