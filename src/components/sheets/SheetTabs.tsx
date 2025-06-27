
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SheetTabsProps {
  sheets: Array<{ id: number; name: string; data: any[] }>;
  activeSheet: number;
  onSheetChange: (index: number) => void;
  onAddSheet: () => void;
  onDeleteSheet: (id: number) => void;
}

export function SheetTabs({ sheets, activeSheet, onSheetChange, onAddSheet, onDeleteSheet }: SheetTabsProps) {
  const [editingSheet, setEditingSheet] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const handleEditStart = (sheet: any) => {
    setEditingSheet(sheet.id);
    setEditName(sheet.name);
  };

  const handleEditSubmit = () => {
    // In a real app, you'd update the sheet name here
    setEditingSheet(null);
    setEditName('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setEditingSheet(null);
      setEditName('');
    }
  };

  return (
    <div className="flex items-center bg-gray-50 border-t border-gray-200 px-2 py-1">
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {sheets.map((sheet, index) => (
          <div
            key={sheet.id}
            className={`flex items-center gap-1 px-3 py-1 rounded-t-md border-t border-l border-r cursor-pointer ${
              activeSheet === index
                ? 'bg-white border-gray-300 border-b-white -mb-px'
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
            }`}
            onClick={() => onSheetChange(index)}
          >
            {editingSheet === sheet.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                className="h-6 w-20 text-xs border-none p-0 focus:ring-0"
                autoFocus
              />
            ) : (
              <span className="text-xs font-medium">{sheet.name}</span>
            )}
            
            {sheets.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleEditStart(sheet)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteSheet(sheet.id)}>
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onAddSheet}
          className="h-6 w-6 p-0 ml-2"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
