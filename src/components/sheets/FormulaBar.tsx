
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface FormulaBarProps {
  selectedCell: { row: number; col: number };
  cellValue: string;
  onCellValueChange: (value: string) => void;
}

export function FormulaBar({ selectedCell, cellValue, onCellValueChange }: FormulaBarProps) {
  const getColumnName = (colIndex: number) => {
    let result = '';
    while (colIndex >= 0) {
      result = String.fromCharCode(65 + (colIndex % 26)) + result;
      colIndex = Math.floor(colIndex / 26) - 1;
    }
    return result;
  };

  const cellReference = `${getColumnName(selectedCell.col)}${selectedCell.row + 1}`;

  return (
    <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-sm font-medium text-gray-700 whitespace-nowrap">
          {cellReference}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Check className="h-3 w-3 text-green-600" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <X className="h-3 w-3 text-red-600" />
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <Input
          value={cellValue}
          onChange={(e) => onCellValueChange(e.target.value)}
          placeholder="Enter formula or value..."
          className="border-none focus:ring-0 focus:border-none shadow-none"
        />
      </div>
    </div>
  );
}
