
import { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";

interface SpreadsheetGridProps {
  data: any[][];
  selectedCell: { row: number; col: number };
  onCellChange: (row: number, col: number, value: string) => void;
  onCellSelect: (row: number, col: number) => void;
}

export function SpreadsheetGrid({ data, selectedCell, onCellChange, onCellSelect }: SpreadsheetGridProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  const getColumnName = (colIndex: number) => {
    let result = '';
    while (colIndex >= 0) {
      result = String.fromCharCode(65 + (colIndex % 26)) + result;
      colIndex = Math.floor(colIndex / 26) - 1;
    }
    return result;
  };

  const handleCellClick = (row: number, col: number) => {
    onCellSelect(row, col);
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setEditingCell({ row, col });
    setEditValue(data[row]?.[col] || '');
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === 'Enter') {
      handleCellDoubleClick(row, col);
    } else if (e.key === 'ArrowUp' && row > 0) {
      onCellSelect(row - 1, col);
    } else if (e.key === 'ArrowDown' && row < data.length - 1) {
      onCellSelect(row + 1, col);
    } else if (e.key === 'ArrowLeft' && col > 0) {
      onCellSelect(row, col - 1);
    } else if (e.key === 'ArrowRight' && col < 25) {
      onCellSelect(row, col + 1);
    }
  };

  const handleEditSubmit = () => {
    if (editingCell) {
      onCellChange(editingCell.row, editingCell.col, editValue);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  return (
    <div className="h-full overflow-auto" ref={gridRef}>
      <div className="inline-block min-w-full">
        {/* Header Row */}
        <div className="flex sticky top-0 bg-gray-50 border-b border-gray-300 z-10">
          <div className="w-12 h-8 bg-gray-100 border-r border-gray-300 flex items-center justify-center text-xs font-medium">
            
          </div>
          {Array.from({ length: 26 }, (_, colIndex) => (
            <div
              key={colIndex}
              className="w-20 h-8 bg-gray-50 border-r border-gray-300 flex items-center justify-center text-xs font-medium text-gray-700"
            >
              {getColumnName(colIndex)}
            </div>
          ))}
        </div>

        {/* Data Rows */}
        {data.map((row, rowIndex) => (
          <div key={rowIndex} className="flex">
            {/* Row Number */}
            <div className="w-12 h-8 bg-gray-50 border-r border-b border-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
              {rowIndex + 1}
            </div>
            
            {/* Data Cells */}
            {Array.from({ length: 26 }, (_, colIndex) => {
              const isSelected = selectedCell.row === rowIndex && selectedCell.col === colIndex;
              const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
              const cellValue = row[colIndex] || '';

              return (
                <div
                  key={colIndex}
                  className={`w-20 h-8 border-r border-b border-gray-300 relative ${
                    isSelected ? 'bg-blue-100 border-blue-500' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                  tabIndex={0}
                  onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                >
                  {isEditing ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleEditSubmit}
                      onKeyDown={handleEditKeyDown}
                      className="w-full h-full border-none p-1 text-xs focus:ring-0 focus:border-none"
                      autoFocus
                    />
                  ) : (
                    <div className="w-full h-full p-1 text-xs overflow-hidden whitespace-nowrap">
                      {cellValue}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
