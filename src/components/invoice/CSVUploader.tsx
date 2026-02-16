import { useState, useCallback } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { parseCSV } from "@/lib/csvParser";
import type { OrderRecord } from "@/types/invoice";

interface CSVUploaderProps {
  onDataLoaded: (records: OrderRecord[]) => void;
}

export default function CSVUploader({ onDataLoaded }: CSVUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const records = parseCSV(text);
      if (records.length === 0) {
        setError("No valid records found in CSV");
        return;
      }
      setFileName(file.name);
      onDataLoaded(records);
    };
    reader.readAsText(file);
  }, [onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer
        ${isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : fileName
            ? "border-green-500 bg-green-50"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }
      `}
      onClick={() => document.getElementById("csv-input")?.click()}
    >
      <input
        id="csv-input"
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileInput}
      />

      {fileName ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <FileText className="w-7 h-7 text-green-600" />
          </div>
          <p className="text-lg font-semibold text-foreground">{fileName}</p>
          <p className="text-sm text-muted-foreground">Click or drag to replace</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Drop your CSV file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 justify-center text-destructive text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
