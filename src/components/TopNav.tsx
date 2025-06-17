
import { Button } from "@/components/ui/button";
import { PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

interface TopNavProps {
  pageName: string;
}

export function TopNav({ pageName }: TopNavProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex items-center gap-4 p-4 border-b border-gray-200 bg-white">
      {isCollapsed && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={toggleSidebar}
          className="text-blue-700 hover:bg-blue-100"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}
      <h1 className="text-2xl font-bold text-gray-900">{pageName}</h1>
    </div>
  );
}
