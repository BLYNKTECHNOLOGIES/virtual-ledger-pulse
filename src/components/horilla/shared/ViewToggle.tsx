
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: "card" | "list";
  onViewChange: (view: "card" | "list") => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange("card")}
        className={cn(
          "h-8 px-3 rounded-md transition-all",
          view === "card" ? "bg-white shadow-sm text-[#009C4A]" : "text-gray-500 hover:text-gray-700"
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange("list")}
        className={cn(
          "h-8 px-3 rounded-md transition-all",
          view === "list" ? "bg-white shadow-sm text-[#009C4A]" : "text-gray-500 hover:text-gray-700"
        )}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
