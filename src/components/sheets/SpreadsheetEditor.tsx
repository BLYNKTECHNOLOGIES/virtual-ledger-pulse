
import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Save, Download, Share2, Undo, Redo, 
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Palette, Merge, Plus, X, BarChart3, PieChart, LineChart,
  Filter, SortAsc, SortDesc, Image, MoreHorizontal
} from "lucide-react";
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { FormulaBar } from './FormulaBar';
import { SheetTabs } from './SheetTabs';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { useToast } from "@/hooks/use-toast";

interface SpreadsheetEditorProps {
  sheet: any;
  onBack: () => void;
}

export function SpreadsheetEditor({ sheet, onBack }: SpreadsheetEditorProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 });
  const [cellValue, setCellValue] = useState('');
  const [gridData, setGridData] = useState<any[][]>([]);
  const [sheets, setSheets] = useState([
    { id: 1, name: 'Sheet1', data: [] },
    { id: 2, name: 'Sheet2', data: [] },
  ]);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize grid with empty data
    const initialData = Array(100).fill(null).map(() => Array(26).fill(''));
    setGridData(initialData);
  }, []);

  const handleSave = () => {
    toast({
      title: "Success",
      description: "Spreadsheet saved successfully!",
    });
  };

  const handleCellChange = (row: number, col: number, value: string) => {
    const newData = [...gridData];
    newData[row][col] = value;
    setGridData(newData);
    setCellValue(value);
  };

  const handleCellSelect = (row: number, col: number) => {
    setSelectedCell({ row, col });
    setCellValue(gridData[row]?.[col] || '');
  };

  const handleAddSheet = () => {
    const newSheet = {
      id: sheets.length + 1,
      name: `Sheet${sheets.length + 1}`,
      data: []
    };
    setSheets([...sheets, newSheet]);
  };

  const handleDeleteSheet = (sheetId: number) => {
    if (sheets.length > 1) {
      setSheets(sheets.filter(s => s.id !== sheetId));
      if (activeSheet >= sheets.length - 1) {
        setActiveSheet(0);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{sheet.name}</h2>
            <p className="text-sm text-gray-500">Last modified: {new Date().toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <SpreadsheetToolbar />

      {/* Formula Bar */}
      <FormulaBar 
        selectedCell={selectedCell}
        cellValue={cellValue}
        onCellValueChange={setCellValue}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-hidden">
          <SpreadsheetGrid
            data={gridData}
            selectedCell={selectedCell}
            onCellChange={handleCellChange}
            onCellSelect={handleCellSelect}
          />
        </div>

        {/* Sheet Tabs */}
        <SheetTabs
          sheets={sheets}
          activeSheet={activeSheet}
          onSheetChange={setActiveSheet}
          onAddSheet={handleAddSheet}
          onDeleteSheet={handleDeleteSheet}
        />
      </div>
    </div>
  );
}
