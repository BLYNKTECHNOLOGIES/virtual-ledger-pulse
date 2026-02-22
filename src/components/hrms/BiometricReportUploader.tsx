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
  // Handle Excel serial date numbers
  const num = parseFloat(dateStr);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Excel serial date: days since 1900-01-01 (with the 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const d = new Date(excelEpoch.getTime() + num * 86400000);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  // Format: "01-Jan-2026" or similar
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapStatus(raw: string): string {
  const lower = raw.toLowerCase().trim()
    .replace(/½/g, "half")   // normalize ½ character
    .replace(/1\/2/g, "half"); // normalize 1/2
  
  // WeeklyOff variants — if also present/half, treat as present/half
  if (lower.includes("weeklyoff") || lower.includes("weekly off")) {
    if (lower.includes("halfpresent") || lower.includes("half present")) return "half_day";
    if (lower.includes("present")) return "present";
    return "weekly_off";
  }
  // Half day variants: "½Present", "½Present (No OutPunch)", "HalfPresent"
  if (lower.includes("halfpresent") || lower.includes("half present")) return "half_day";
  // Present variants: "Present", "Present (No OutPunch)"
  if (lower.includes("present")) return "present";
  if (lower === "absent") return "absent";
  if (lower === "late") return "late";
  // If it has a check-in time, it's at least present — but let the caller handle that
  return "absent"; // unknown statuses default to absent, not present
}

function parseTimeStr(val: any): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === "00:00") return null;
  // HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(str)) return str;
  // Excel serial time (0-1 range)
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
  // Use raw:false to get formatted strings (especially dates)
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  console.log("[BiometricParser] Total rows:", rows.length);
  // Log first 20 rows for debugging column structure
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    console.log(`[BiometricParser] Row ${i}:`, JSON.stringify(rows[i]));
  }

  const results: ParsedAttendanceRow[] = [];
  let currentCode = "";
  let currentName = "";

  // Column index mapping — auto-detected from header row "Date | InTime | OutTime | Shift | ..."
  let colDate = 0, colIn = 2, colOut = 3, colShift = 5, colDuration = 6, colStatus = 7, colRemarksStart = 8;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Join all cells to search across merged-cell positions
    const rowStr = row.map((c: any) => String(c || "").trim()).join("|");
    const cellA = String(row[0] || "").trim();

    // Detect employee header by scanning all cells for "Employee Code"
    if (rowStr.toLowerCase().includes("employee code")) {
      currentCode = "";
      currentName = "";
      // Find the code and name by scanning all cells
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] || "").trim();
        const vl = v.toLowerCase();
        if (vl.includes("employee code")) {
          // Code might be embedded: "Employee Code:  3" or in next cell
          const match = v.match(/employee\s*code\s*:?\s*(\d+)/i);
          if (match) {
            currentCode = match[1];
          } else {
            for (let n = c + 1; n < row.length && n <= c + 4; n++) {
              const nv = String(row[n] || "").trim();
              if (nv && /^\d+$/.test(nv)) {
                currentCode = nv;
                break;
              }
            }
          }
        }
        if (vl.includes("employee name")) {
          // Name might be embedded: "Employee Name : PRIYASAXENA" or in next cell
          const nameMatch = v.match(/employee\s*name\s*:?\s*(.+)/i);
          if (nameMatch && nameMatch[1].trim()) {
            currentName = nameMatch[1].trim();
          } else {
            // Scan forward for the name value
            for (let n = c + 1; n < row.length && n <= c + 5; n++) {
              const name = String(row[n] || "").trim();
              if (name && !name.includes(":") && !/employee/i.test(name) && name.length > 1) {
                currentName = name;
                break;
              }
            }
          }
        }
      }
      // If name still empty, try to find any non-empty cell that's not the code or a label
      if (!currentName) {
        const allVals = row.map((c: any) => String(c || "").trim()).filter((v: string) => 
          v && v !== currentCode && !v.toLowerCase().includes("employee") && !v.includes(":")
        );
        if (allVals.length > 0) currentName = allVals[allVals.length - 1]; // Take last non-label value
      }
      console.log(`[BiometricParser] Found employee: code=${currentCode}, name=${currentName}`);
      continue;
    }

    // Auto-detect column positions from header row
    if (rowStr.toLowerCase().includes("intime") || rowStr.toLowerCase().includes("in time")) {
      for (let c = 0; c < row.length; c++) {
        const v = String(row[c] || "").trim().toLowerCase();
        if (v === "date") colDate = c;
        if (v === "intime" || v === "in time") colIn = c;
        if (v === "outtime" || v === "out time") colOut = c;
        if (v === "shift") colShift = c;
        if (v.includes("total duration") || v === "duration") colDuration = c;
        if (v === "status") colStatus = c;
        if (v === "remarks") colRemarksStart = c;
      }
      console.log(`[BiometricParser] Column map: date=${colDate}, in=${colIn}, out=${colOut}, shift=${colShift}, duration=${colDuration}, status=${colStatus}`);
      continue;
    }

    // Skip non-data rows using rowStr to handle merged cells
    const rowLower = rowStr.toLowerCase();
    if (rowLower.includes("total duration=") || rowLower.includes("total duration =")) continue;
    if (rowLower.includes("daily attendance")) continue;
    if (rowLower.includes("company:")) continue;
    if (rowLower.includes("department:")) continue;
    if (rowLower.includes("printed on")) continue;
    if (!currentCode) continue;

    // Use auto-detected colDate position (not always column 0)
    const dateCell = String(row[colDate] || "").trim();
    if (!dateCell) continue;
    if (dateCell.toLowerCase() === "date") continue;

    const parsedDate = parseDate(dateCell);
    if (!parsedDate) continue;

    const inTime = parseTimeStr(row[colIn]);
    const outTime = parseTimeStr(row[colOut]);
    const shift = String(row[colShift] || "").trim();
    const totalDuration = String(row[colDuration] || "").trim();
    let rawStatus = String(row[colStatus] || "").trim();
    
    // If rawStatus is empty, scan nearby columns for a status keyword
    if (!rawStatus) {
      for (let c = Math.max(0, colStatus - 2); c <= Math.min(row.length - 1, colStatus + 2); c++) {
        const v = String(row[c] || "").trim();
        if (v && /present|absent|weeklyoff|weekly off|late|½present|halfpresent/i.test(v)) {
          rawStatus = v;
          break;
        }
      }
    }
    
    // Collect remarks from remaining columns
    const remarkParts: string[] = [];
    for (let c = colRemarksStart; c < Math.min(row.length, colRemarksStart + 10); c++) {
      const v = String(row[c] || "").trim();
      if (v) remarkParts.push(v);
    }
    const remarks = remarkParts.join(" | ");

    if (!rawStatus) continue;

    const status = mapStatus(rawStatus);
    
    // Log first few rows per employee for debugging
    if (results.filter(r => r.employeeCode === currentCode).length < 3) {
      console.log(`[BiometricParser] Row: code=${currentCode}, date=${parsedDate}, in=${inTime}, out=${outTime}, rawStatus="${rawStatus}", mapped="${status}"`);
    }

    results.push({
      employeeCode: currentCode,
      employeeName: currentName || `Employee ${currentCode}`,
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

  console.log(`[BiometricParser] Total parsed records: ${results.length}`);
  if (results.length > 0) {
    console.log("[BiometricParser] Sample:", JSON.stringify(results[0]));
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
        // Build check_in/check_out as full timestamps if time is available
        const checkInTs = row.checkIn ? `${row.date}T${row.checkIn}:00` : null;
        const checkOutTs = row.checkOut ? `${row.date}T${row.checkOut}:00` : null;

        const { data: existing } = await (supabase as any)
          .from("hr_attendance")
          .select("id")
          .eq("employee_id", row.employeeId)
          .eq("attendance_date", row.date)
          .maybeSingle();

        // Build payload - only include non-null time fields
        const payload: Record<string, any> = {
          attendance_status: row.status,
          notes: row.remarks || row.rawStatus || null,
        };
        if (checkInTs) payload.check_in = checkInTs;
        if (checkOutTs) payload.check_out = checkOutTs;

        if (existing) {
          const { error } = await (supabase as any)
            .from("hr_attendance")
            .update(payload)
            .eq("id", existing.id);
          if (!error) inserted++;
          else { console.error("[BiometricImport] Update error:", error); skipped++; }
        } else {
          const { error } = await (supabase as any)
            .from("hr_attendance")
            .insert({
              employee_id: row.employeeId,
              attendance_date: row.date,
              work_type: "office",
              ...payload,
            });
          if (!error) inserted++;
          else { console.error("[BiometricImport] Insert error:", error); skipped++; }
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
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
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
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-medium text-destructive">Unmatched employees (will be skipped):</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {unmatchedNames.map((name, i) => (
                    <span key={i} className="px-2 py-1 bg-destructive/10 border border-destructive/20 rounded text-xs font-medium text-destructive">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[45vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[50px]">Match</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[180px]">Employee</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[100px]">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[70px]">In</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[70px]">Out</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[90px]">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Remarks</th>
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
                      <td className="px-3 py-1.5 font-medium truncate">
                        {row.matchedName || row.employeeName}
                        {!row.employeeId && <span className="text-destructive ml-1 text-xs">(unmatched)</span>}
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
                      <td className="px-3 py-1.5 text-muted-foreground truncate">{row.remarks || row.rawStatus}</td>
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
