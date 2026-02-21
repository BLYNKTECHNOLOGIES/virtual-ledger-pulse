import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ParsedAttendanceRow {
  employeeCode: string;
  employeeName: string;
  date: string; // yyyy-MM-dd
  checkIn: string | null;
  checkOut: string | null;
  shift: string;
  totalDuration: string;
  status: string; // present, absent, half_day, weekly_off
  rawStatus: string;
  remarks: string;
}

interface MatchedRow extends ParsedAttendanceRow {
  employeeId: string | null;
  matchedName: string | null;
}

function parseDate(dateStr: string): string | null {
  // Format: "01-Jan-2026" or similar
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower === "present" || lower === "present (no outpunch)") return "present";
  if (lower.startsWith("½present") || lower.startsWith("halfpresent") || lower === "½present" || lower.includes("½present")) return "half_day";
  if (lower === "absent") return "absent";
  if (lower.includes("weeklyoff") || lower === "weekly off") return "weekly_off";
  if (lower.includes("weeklyoff present")) return "present";
  if (lower === "late") return "late";
  return "present"; // fallback
}

function parseTimeStr(val: any): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === "00:00") return null;
  // Could be "11:13" or Excel time serial
  if (/^\d{1,2}:\d{2}$/.test(str)) return str;
  // If it's a number (Excel serial time), convert
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return str;
}

export function parseBiometricXLS(data: ArrayBuffer): ParsedAttendanceRow[] {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  const results: ParsedAttendanceRow[] = [];
  let currentCode = "";
  let currentName = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const cellA = String(row[0] || "").trim();
    const cellC = String(row[2] || "").trim();

    // Detect employee header: "Employee Code:" in col 0, code in col 2, name later
    if (cellA === "Employee Code:" || cellA.toLowerCase().includes("employee code")) {
      currentCode = cellC;
      // Find name - usually col 5 or 6 after "Employee Name :"
      for (let c = 3; c < row.length; c++) {
        const v = String(row[c] || "").trim();
        if (v && v !== "Employee Name :" && v !== "Employee Name:" && !v.toLowerCase().includes("employee name")) {
          // Check if previous cell was "Employee Name"
          const prev = String(row[c - 1] || "").trim();
          if (prev.toLowerCase().includes("employee name")) {
            currentName = v;
            break;
          }
        }
      }
      // Fallback: find the name by looking for a non-empty cell after the name label
      if (!currentName) {
        for (let c = 3; c < row.length; c++) {
          const v = String(row[c] || "").trim();
          if (v && !v.toLowerCase().includes("employee") && !v.includes(":")) {
            currentName = v;
            break;
          }
        }
      }
      continue;
    }

    // Skip header rows (Date, InTime, OutTime...)
    if (cellA === "Date" || cellA.toLowerCase() === "date") continue;
    // Skip summary/total rows
    if (cellA.toLowerCase().includes("total duration") || cellA.toLowerCase().includes("total duration=")) continue;
    if (!currentCode || !currentName) continue;

    // Try to parse date from cellA
    const parsedDate = parseDate(cellA);
    if (!parsedDate) continue;

    const inTime = parseTimeStr(row[2]);
    const outTime = parseTimeStr(row[3]);
    const shift = String(row[5] || "").trim();
    const totalDuration = String(row[6] || "").trim();
    const rawStatus = String(row[7] || "").trim();
    const remarks = String(row[9] || "").trim();

    if (!rawStatus) continue;

    const status = mapStatus(rawStatus);

    results.push({
      employeeCode: currentCode,
      employeeName: currentName,
      date: parsedDate,
      checkIn: inTime,
      checkOut: outTime,
      shift,
      totalDuration,
      status,
      rawStatus,
      remarks,
    });
  }

  return results;
}

interface BiometricReportUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BiometricReportUploader({ open, onOpenChange }: BiometricReportUploaderProps) {
  const queryClient = useQueryClient();
  const [parsedRows, setParsedRows] = useState<MatchedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [uploadStats, setUploadStats] = useState({ inserted: 0, skipped: 0, unmatched: 0 });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true);
      return data || [];
    },
  });

  const matchEmployees = useCallback((parsed: ParsedAttendanceRow[]): MatchedRow[] => {
    return parsed.map((row) => {
      // Try matching by badge_id = employeeCode, then by name
      let match = employees.find((e: any) => String(e.badge_id) === String(row.employeeCode));
      if (!match) {
        const normalizedName = row.employeeName.toLowerCase().replace(/\s+/g, " ").trim();
        match = employees.find((e: any) => {
          const fullName = `${e.first_name} ${e.last_name}`.toLowerCase().replace(/\s+/g, " ").trim();
          return fullName === normalizedName || 
                 e.first_name?.toLowerCase() === normalizedName ||
                 fullName.includes(normalizedName) || 
                 normalizedName.includes(fullName);
        });
      }
      return {
        ...row,
        employeeId: match?.id || null,
        matchedName: match ? `${match.first_name} ${match.last_name}` : null,
      };
    });
  }, [employees]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xls|xlsx|csv)$/i)) {
      toast.error("Please upload an XLS or XLSX file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      const parsed = parseBiometricXLS(data);
      if (parsed.length === 0) {
        toast.error("No attendance records found in file");
        return;
      }
      const matched = matchEmployees(parsed);
      setParsedRows(matched);
      setFileName(file.name);
      setStep("preview");
    };
    reader.readAsArrayBuffer(file);
  }, [matchEmployees]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const matchedRows = parsedRows.filter((r) => r.employeeId && r.status !== "weekly_off");
      let inserted = 0;
      let skipped = 0;

      // Batch upsert - check existing records first
      for (const row of matchedRows) {
        const { data: existing } = await (supabase as any)
          .from("hr_attendance")
          .select("id")
          .eq("employee_id", row.employeeId)
          .eq("attendance_date", row.date)
          .maybeSingle();

        if (existing) {
          // Update existing
          const { error } = await (supabase as any)
            .from("hr_attendance")
            .update({
              check_in: row.checkIn,
              check_out: row.checkOut,
              attendance_status: row.status,
              notes: row.remarks || row.rawStatus,
            })
            .eq("id", existing.id);
          if (!error) inserted++;
          else skipped++;
        } else {
          // Insert new
          const { error } = await (supabase as any)
            .from("hr_attendance")
            .insert({
              employee_id: row.employeeId,
              attendance_date: row.date,
              check_in: row.checkIn,
              check_out: row.checkOut,
              attendance_status: row.status,
              notes: row.remarks || row.rawStatus,
              work_type: "office",
            });
          if (!error) inserted++;
          else skipped++;
        }
      }

      const unmatched = parsedRows.filter((r) => !r.employeeId).length;
      setUploadStats({ inserted, skipped, unmatched });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_attendance"] });
      setStep("done");
      toast.success("Attendance data imported successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => {
    setParsedRows([]);
    setFileName(null);
    setStep("upload");
    setUploadStats({ inserted: 0, skipped: 0, unmatched: 0 });
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Summary stats for preview
  const uniqueEmployees = new Set(parsedRows.map((r) => r.employeeCode)).size;
  const matchedCount = new Set(parsedRows.filter((r) => r.employeeId).map((r) => r.employeeCode)).size;
  const unmatchedNames = [...new Set(parsedRows.filter((r) => !r.employeeId).map((r) => r.employeeName))];
  const dateRange = parsedRows.length > 0
    ? `${parsedRows[0].date} to ${parsedRows[parsedRows.length - 1].date}`
    : "";
  const nonWeeklyOff = parsedRows.filter((r) => r.status !== "weekly_off" && r.employeeId).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Upload Biometric Attendance Report
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all"
            onClick={() => document.getElementById("biometric-file-input")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <input
              id="biometric-file-input"
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">Drop your biometric report here</p>
              <p className="text-sm text-muted-foreground">Supports .xls and .xlsx files from biometric devices</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{fileName}</p>
                <p className="text-xs text-muted-foreground">Period: {dateRange}</p>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" /> Change File
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{uniqueEmployees}</p>
                  <p className="text-xs text-muted-foreground">Employees Found</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{matchedCount}</p>
                  <p className="text-xs text-muted-foreground">Matched</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{unmatchedNames.length}</p>
                  <p className="text-xs text-muted-foreground">Unmatched</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{nonWeeklyOff}</p>
                  <p className="text-xs text-muted-foreground">Records to Import</p>
                </CardContent>
              </Card>
            </div>

            {unmatchedNames.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Unmatched employees (will be skipped):</p>
                </div>
                <p className="text-xs text-muted-foreground">{unmatchedNames.join(", ")}</p>
              </div>
            )}

            <div className="max-h-[40vh] overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {["Match", "Employee", "Date", "In", "Out", "Status", "Remarks"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.filter(r => r.status !== "weekly_off").slice(0, 200).map((row, i) => (
                    <tr key={i} className={`border-b ${!row.employeeId ? "bg-destructive/5" : ""}`}>
                      <td className="px-3 py-1.5">
                        {row.employeeId ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                        {row.matchedName || row.employeeName}
                        {!row.employeeId && <span className="text-destructive ml-1">(unmatched)</span>}
                      </td>
                      <td className="px-3 py-1.5">{row.date}</td>
                      <td className="px-3 py-1.5">{row.checkIn || "—"}</td>
                      <td className="px-3 py-1.5">{row.checkOut || "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          row.status === "present" ? "bg-green-100 text-green-700" :
                          row.status === "absent" ? "bg-red-100 text-red-700" :
                          row.status === "half_day" ? "bg-yellow-100 text-yellow-700" :
                          "bg-muted text-muted-foreground"
                        }`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">{row.remarks || row.rawStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Import Complete</p>
              <p className="text-sm text-muted-foreground mt-1">
                {uploadStats.inserted} records imported • {uploadStats.skipped} skipped • {uploadStats.unmatched} unmatched employees
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || nonWeeklyOff === 0}
                className="bg-[#E8604C] hover:bg-[#d4553f]"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {nonWeeklyOff} Records
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
