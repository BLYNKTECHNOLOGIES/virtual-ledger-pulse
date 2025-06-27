
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Undo, Redo, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight,
  Palette, Merge, BarChart3, PieChart, LineChart,
  Filter, SortAsc, SortDesc, Image, Plus, Minus,
  MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SpreadsheetToolbar() {
  return (
    <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50">
      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Text Formatting */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <Bold className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <Italic className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <Underline className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Text Alignment */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Cell Operations */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <Palette className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <Merge className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Row/Column Operations */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Insert Row Above</DropdownMenuItem>
            <DropdownMenuItem>Insert Row Below</DropdownMenuItem>
            <DropdownMenuItem>Insert Column Left</DropdownMenuItem>
            <DropdownMenuItem>Insert Column Right</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Minus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Delete Row</DropdownMenuItem>
            <DropdownMenuItem>Delete Column</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Data Operations */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <Filter className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <SortAsc className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <SortDesc className="h-4 w-4" />
        </Button>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Charts */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <BarChart3 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <BarChart3 className="h-4 w-4 mr-2" />
              Bar Chart
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LineChart className="h-4 w-4 mr-2" />
              Line Chart
            </DropdownMenuItem>
            <DropdownMenuItem>
              <PieChart className="h-4 w-4 mr-2" />
              Pie Chart
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      {/* Insert */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm">
          <Image className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1" />
      
      {/* More Options */}
      <Button variant="ghost" size="sm">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
