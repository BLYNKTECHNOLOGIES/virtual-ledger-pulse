import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, Clock, 
  AlertTriangle, History, Eye, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";

// ─── Types ───
interface ReconciliationItem {
  category: "BANK" | "STOCK" | "POS";
  id: string;
  name: string;
  identifier: string; // account number, wallet address, gateway name
  operator_value: number;
  erp_value: number;
  difference: number;
  within_tolerance: boolean;
}

interface ReconciliationRecord {
  id: string;
  submitted_by: string;
  submitted_at: string;
  shift_label: string | null;
  submitted_data: any[];
  erp_snapshot: any[];
  comparison_result: ReconciliationItem[];
  has_mismatches: boolean;
  mismatch_count: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  parent_reconciliation_id: string | null;
}

// Tolerances
const BANK_TOLERANCE = 100;   // ₹100
const STOCK_TOLERANCE = 2;    // $2
const POS_TOLERANCE = 2;      // ₹2

export function ShiftReconciliationWidget() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('shift_reconciliation_create');
  const canApprove = hasPermission('shift_reconciliation_approve');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mainDialogOpen, setMainDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<"actions" | "report" | "history" | "detail">("actions");
  const [reportData, setReportData] = useState<ReconciliationItem[] | null>(null);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [shiftLabel, setShiftLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [detailRecord, setDetailRecord] = useState<ReconciliationRecord | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    BANK: true, STOCK: true, POS: true
  });

  // Fetch history
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["shift_reconciliations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_reconciliations")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ReconciliationRecord[];
    },
  });

  // ─── Download CSV Template ───
  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      // Fetch active banks (not dormant, not inactive)
      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("id, account_name, account_number, bank_name, balance")
        .eq("status", "ACTIVE")
        .eq("account_status", "ACTIVE")
        .is("dormant_at", null);

      // Fetch active wallets with USDT balances
      const { data: wallets } = await supabase
        .from("wallets")
        .select("id, wallet_name, wallet_address")
        .eq("is_active", true);

      const walletIds = (wallets || []).map(w => w.id);
      let walletBalances: any[] = [];
      if (walletIds.length > 0) {
        const { data: balances } = await supabase
          .from("wallet_asset_balances")
          .select("wallet_id, balance")
          .in("wallet_id", walletIds)
          .eq("asset_code", "USDT");
        walletBalances = balances || [];
      }

      // Fetch active payment gateways
      const { data: gateways } = await supabase
        .from("sales_payment_methods")
        .select("id, type, nickname")
        .eq("payment_gateway", true)
        .eq("is_active", true);

      // Build CSV rows
      const bankRows = (banks || []).map(b => ({
        Category: "BANK",
        ID: b.id,
        Name: b.account_name,
        Identifier: `${b.bank_name} - ${b.account_number}`,
        "Operator Balance": "",
      }));

      const stockRows = (wallets || []).map(w => ({
        Category: "STOCK",
        ID: w.id,
        Name: w.wallet_name,
        Identifier: w.wallet_address,
        "Operator Balance": "",
      }));

      const posRows = (gateways || []).map(g => ({
        Category: "POS",
        ID: g.id,
        Name: g.nickname || g.type,
        Identifier: g.type,
        "Operator Balance": "",
      }));

      const allDataRows = [...bankRows, ...stockRows, ...posRows];

      if (allDataRows.length === 0) {
        toast({ title: "No Data", description: "No active banks, wallets, or gateways found.", variant: "destructive" });
        return;
      }

      // Build sheet with section headers & blank separator rows
      const sheetData: Record<string, string>[] = [];
      const sectionHeaderRows: number[] = []; // 0-indexed row numbers for section headers
      const sections = [
        { label: "BANK ACCOUNTS", rows: bankRows },
        { label: "STOCK / WALLETS", rows: stockRows },
        { label: "POS / PAYMENT GATEWAYS", rows: posRows },
      ];

      // Row 0 = header row (added by json_to_sheet), so we track data rows
      for (const section of sections) {
        if (section.rows.length === 0) continue;
        // Add a section header row (merged across columns visually)
        sectionHeaderRows.push(sheetData.length);
        sheetData.push({
          Category: `── ${section.label} ──`,
          ID: "",
          Name: "",
          Identifier: "",
          "Operator Balance": "",
        });
        // Add actual data rows
        sheetData.push(...section.rows);
        // Add a blank separator row
        sheetData.push({ Category: "", ID: "", Name: "", Identifier: "", "Operator Balance": "" });
      }

      // Remove trailing blank row
      if (sheetData.length > 0 && sheetData[sheetData.length - 1].Category === "") {
        sheetData.pop();
      }

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(sheetData);

      // Set column widths
      ws["!cols"] = [
        { wch: 30 }, // Category / section label
        { wch: 40 }, // ID
        { wch: 32 }, // Name
        { wch: 50 }, // Identifier
        { wch: 22 }, // Operator Balance
      ];

      // Bold section header rows & the header row
      // xlsx community edition doesn't support styles natively, but we make the
      // section labels clearly distinguishable via the text prefix ── already added above.

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shift Reconciliation");
      XLSX.writeFile(wb, `Shift_Reconciliation_Template_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);

      toast({ title: "Template Downloaded", description: "Fill the 'Operator Balance' column and upload back." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  // ─── Upload & Compare ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      // Filter out section header rows (start with ──) and blank separator rows
      const rows = rawRows.filter(r => {
        const cat = String(r.Category || "").trim();
        return cat && !cat.startsWith("──") && ["BANK", "STOCK", "POS"].includes(cat);
      });

      if (!rows.length) {
        toast({ title: "Empty File", description: "The uploaded file has no data.", variant: "destructive" });
        return;
      }

      // Validate required columns
      const requiredCols = ["Category", "ID", "Name", "Operator Balance"];
      const missingCols = requiredCols.filter(c => !(c in rows[0]));
      if (missingCols.length > 0) {
        toast({ title: "Invalid Format", description: `Missing columns: ${missingCols.join(", ")}`, variant: "destructive" });
        return;
      }

      // Validate all operator balances are filled
      const emptyRows = rows.filter(r => r["Operator Balance"] === "" || r["Operator Balance"] === undefined || r["Operator Balance"] === null);
      if (emptyRows.length > 0) {
        toast({ 
          title: "Incomplete Data", 
          description: `${emptyRows.length} row(s) have empty 'Operator Balance'. Please fill all values.`, 
          variant: "destructive" 
        });
        return;
      }

      // Fetch ERP values for comparison
      const bankIds = rows.filter(r => r.Category === "BANK").map(r => r.ID);
      const stockIds = rows.filter(r => r.Category === "STOCK").map(r => r.ID);
      const posIds = rows.filter(r => r.Category === "POS").map(r => r.ID);

      // Bank balances - use actual balance from bank_accounts (already maintained by triggers)
      let bankBalances: Record<string, number> = {};
      if (bankIds.length > 0) {
        const { data } = await supabase
          .from("bank_accounts")
          .select("id, balance")
          .in("id", bankIds);
        (data || []).forEach(b => { bankBalances[b.id] = b.balance || 0; });
      }

      // Wallet USDT balances
      let stockBalances: Record<string, number> = {};
      if (stockIds.length > 0) {
        const { data } = await supabase
          .from("wallet_asset_balances")
          .select("wallet_id, balance")
          .in("wallet_id", stockIds)
          .eq("asset_code", "USDT");
        (data || []).forEach(w => { stockBalances[w.wallet_id] = w.balance || 0; });
      }

      // POS pending settlements
      let posBalances: Record<string, number> = {};
      if (posIds.length > 0) {
        const { data } = await supabase
          .from("pending_settlements")
          .select("payment_method_id, settlement_amount")
          .in("payment_method_id", posIds)
          .eq("status", "PENDING");
        // Sum by payment method
        (data || []).forEach(p => {
          const key = p.payment_method_id || "";
          posBalances[key] = (posBalances[key] || 0) + (p.settlement_amount || 0);
        });
      }

      // Build comparison
      const comparison: ReconciliationItem[] = rows.map(row => {
        const category = row.Category as "BANK" | "STOCK" | "POS";
        const operatorValue = Number(row["Operator Balance"]) || 0;
        let erpValue = 0;
        let tolerance = 0;

        if (category === "BANK") {
          erpValue = bankBalances[row.ID] || 0;
          tolerance = BANK_TOLERANCE;
        } else if (category === "STOCK") {
          erpValue = stockBalances[row.ID] || 0;
          tolerance = STOCK_TOLERANCE;
        } else if (category === "POS") {
          erpValue = posBalances[row.ID] || 0;
          tolerance = POS_TOLERANCE;
        }

        const difference = Math.abs(operatorValue - erpValue);
        const withinTolerance = difference <= tolerance;

        return {
          category,
          id: row.ID,
          name: row.Name,
          identifier: row.Identifier || "",
          operator_value: operatorValue,
          erp_value: erpValue,
          difference: Number((operatorValue - erpValue).toFixed(4)),
          within_tolerance: withinTolerance,
        };
      });

      const mismatches = comparison.filter(c => !c.within_tolerance);

      // Save to DB
      const { data: inserted, error } = await supabase
        .from("shift_reconciliations")
        .insert({
          submitted_by: user?.email || user?.id || "unknown",
          shift_label: shiftLabel || null,
          submitted_data: rows as any,
          erp_snapshot: { bankBalances, stockBalances, posBalances } as any,
          comparison_result: comparison as any,
          has_mismatches: mismatches.length > 0,
          mismatch_count: mismatches.length,
          status: mismatches.length > 0 ? "pending_review" : "approved",
          reviewed_by: mismatches.length === 0 ? "auto" : null,
          reviewed_at: mismatches.length === 0 ? new Date().toISOString() : null,
        })
        .select("id")
        .single();

      if (error) throw error;

      setReportData(comparison);
      setCurrentRecordId(inserted?.id || null);
      setActiveView("report");
      queryClient.invalidateQueries({ queryKey: ["shift_reconciliations"] });

      if (mismatches.length === 0) {
        toast({ title: "✅ All Clear", description: "All balances match within tolerance. Auto-approved." });
      } else {
        toast({ 
          title: "⚠️ Mismatches Found", 
          description: `${mismatches.length} item(s) outside tolerance. Review required.`,
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  // ─── Approve / Reject ───
  const handleReview = async (action: "approved" | "rejected") => {
    if (!currentRecordId) return;

    // Require review notes when approving with mismatches
    const hasMismatches = reportData?.some(i => !i.within_tolerance) || 
      (detailRecord?.has_mismatches);
    if (action === "approved" && hasMismatches && !reviewNotes.trim()) {
      toast({ 
        title: "Review notes required", 
        description: "You must provide review notes explaining each mismatch before approving.", 
        variant: "destructive" 
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("shift_reconciliations")
        .update({
          status: action,
          reviewed_by: user?.email || user?.id || "unknown",
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
        })
        .eq("id", currentRecordId);

      if (error) throw error;

      toast({ title: action === "approved" ? "✅ Approved" : "❌ Rejected", description: `Shift reconciliation ${action}.` });
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["shift_reconciliations"] });

      if (action === "rejected") {
        setActiveView("actions");
      } else {
        setActiveView("history");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
      case "pending_review": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending Review</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCurrencySymbol = (category: string) => category === "STOCK" ? "$" : "₹";
  const getToleranceLabel = (category: string) => {
    if (category === "BANK") return `±₹${BANK_TOLERANCE}`;
    if (category === "STOCK") return `±$${STOCK_TOLERANCE}`;
    return `±₹${POS_TOLERANCE}`;
  };

  // ─── Report View ───
  const renderReport = (items: ReconciliationItem[], showActions = true) => {
    const categories = ["BANK", "STOCK", "POS"] as const;
    const categoryLabels = { BANK: "🏦 Banks", STOCK: "📦 Stock (USDT)", POS: "💳 POS / Payment Gateways" };

    return (
      <div className="space-y-4">
        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          if (catItems.length === 0) return null;
          const catMismatches = catItems.filter(i => !i.within_tolerance).length;
          const expanded = expandedCategories[cat] !== false;

          return (
            <div key={cat} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{categoryLabels[cat]}</span>
                  <Badge variant="secondary" className="text-xs">{catItems.length} items</Badge>
                  {catMismatches > 0 && (
                    <Badge className="bg-red-100 text-red-700 text-xs">{catMismatches} mismatch(es)</Badge>
                  )}
                  
                </div>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-left p-2 font-medium">Identifier</th>
                        <th className="text-right p-2 font-medium">Operator Value</th>
                        <th className="text-right p-2 font-medium">ERP Value</th>
                        <th className="text-right p-2 font-medium">Difference</th>
                        <th className="text-center p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`border-b ${!item.within_tolerance ? "bg-red-50" : ""}`}
                        >
                          <td className="p-2 font-medium">{item.name}</td>
                          <td className="p-2 text-muted-foreground text-xs max-w-[200px] truncate">{item.identifier}</td>
                          <td className="p-2 text-right font-mono">
                            {getCurrencySymbol(cat)}{item.operator_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {getCurrencySymbol(cat)}{item.erp_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`p-2 text-right font-mono font-semibold ${!item.within_tolerance ? "text-red-600" : "text-green-600"}`}>
                            {item.difference > 0 ? "+" : ""}{getCurrencySymbol(cat)}{item.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-center">
                            {item.within_tolerance ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 inline-block" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 inline-block" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Review Actions */}
        {showActions && reportData && reportData.some(i => !i.within_tolerance) && (
          <div className="border rounded-lg p-4 bg-amber-50 space-y-3">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Mismatches detected — Action required</span>
            </div>
            {canApprove ? (
              <>
                <Textarea
placeholder="Review notes explaining each mismatch (REQUIRED for approval)..."
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  className={`bg-white ${!reviewNotes.trim() ? "border-amber-400" : "border-green-400"}`}
                />
                {!reviewNotes.trim() && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Review notes are mandatory to approve with mismatches
                  </p>
                )}
                <div className="flex gap-2">
                  <Button 
                    onClick={() => handleReview("approved")} 
                    className="bg-green-600 hover:bg-green-700"
                    disabled={!reviewNotes.trim()}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve with Notes
                  </Button>
                  <Button onClick={() => handleReview("rejected")} variant="destructive">
                    <XCircle className="h-4 w-4 mr-1" /> Reject & Request Re-upload
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setActiveView("actions");
                    setReportData(null);
                  }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Upload Updated CSV
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">You don't have permission to approve or reject. Please contact an authorized reviewer.</p>
            )}
          </div>
        )}

        {showActions && reportData && reportData.every(i => i.within_tolerance) && (
          <div className="border rounded-lg p-4 bg-green-50 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-700">All values match within tolerance</p>
              <p className="text-sm text-green-600">This reconciliation has been auto-approved.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pendingCount = history?.filter(h => h.status === "pending_review").length || 0;

  return (
    <>
      {/* Shift Reconciliation Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setMainDialogOpen(true); setActiveView("actions"); }}
        className="bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 shadow-sm flex-shrink-0 relative"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden sm:inline ml-2">Shift Reconciliation</span>
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </Button>

      {/* Main Dialog */}
      <Dialog open={mainDialogOpen} onOpenChange={setMainDialogOpen}>
        <DialogContent className="!w-[95vw] !max-w-[95vw] !max-h-[95vh] h-[95vh] overflow-hidden flex flex-col p-0 md:!w-[95vw] md:!max-w-[95vw] md:!max-h-[95vh]">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              Shift Reconciliation
            </DialogTitle>
            <DialogDescription>
              Download template, fill operator balances, upload to compare against ERP.
            </DialogDescription>
            {/* Tab Navigation */}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant={activeView === "actions" ? "default" : "outline"}
                onClick={() => setActiveView("actions")}
              >
                <Upload className="h-4 w-4 mr-1" /> Submit
              </Button>
              <Button
                size="sm"
                variant={activeView === "report" && reportData ? "default" : "outline"}
                onClick={() => reportData && setActiveView("report")}
                disabled={!reportData}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Report
              </Button>
              <Button
                size="sm"
                variant={activeView === "history" ? "default" : "outline"}
                onClick={() => { setActiveView("history"); setDetailRecord(null); }}
              >
                <History className="h-4 w-4 mr-1" /> History
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* ─── ACTIONS VIEW ─── */}
            {activeView === "actions" && (
              <div className="space-y-6">
                {/* Step 1: Shift Label */}
                <div className="space-y-2">
                  <Label>Shift Label (optional)</Label>
                  <Input
                    placeholder="e.g. Morning Shift, Night Shift..."
                    value={shiftLabel}
                    onChange={e => setShiftLabel(e.target.value)}
                  />
                </div>

                {/* Step 2: Download */}
                <Card className="border-2 border-dashed border-indigo-200 bg-indigo-50/50">
                  <CardContent className="p-6 text-center space-y-3">
                    <Download className="h-10 w-10 text-indigo-500 mx-auto" />
                    <h3 className="font-semibold text-lg">Step 1: Download Template</h3>
                    <p className="text-sm text-muted-foreground">
                      Downloads an Excel file with all active Banks, USDT Wallets, and Payment Gateways.
                      Fill the "Operator Balance" column with actual values.
                    </p>
                    <Button onClick={handleDownloadTemplate} disabled={downloading} className="bg-indigo-600 hover:bg-indigo-700">
                      <Download className="h-4 w-4 mr-2" />
                      {downloading ? "Generating..." : "Download Template"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Step 3: Upload */}
                <Card className="border-2 border-dashed border-green-200 bg-green-50/50">
                  <CardContent className="p-6 text-center space-y-3">
                    <Upload className="h-10 w-10 text-green-500 mx-auto" />
                    <h3 className="font-semibold text-lg">Step 2: Upload Filled Template</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload the filled Excel/CSV file. The system will compare operator values against ERP balances.
                    </p>
                    <div className="relative inline-block">
                      <Button disabled={uploading} className="bg-green-600 hover:bg-green-700">
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? "Processing..." : "Upload & Compare"}
                      </Button>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={uploading}
                      />
                    </div>
                  </CardContent>
                </Card>

              </div>
            )}

            {/* ─── REPORT VIEW ─── */}
            {activeView === "report" && reportData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Reconciliation Report</h3>
                  <div className="flex gap-2 text-sm">
                    <Badge className="bg-green-100 text-green-700">
                      {reportData.filter(i => i.within_tolerance).length} Match
                    </Badge>
                    <Badge className="bg-red-100 text-red-700">
                      {reportData.filter(i => !i.within_tolerance).length} Mismatch
                    </Badge>
                  </div>
                </div>
                {renderReport(reportData, true)}
              </div>
            )}

            {/* ─── HISTORY VIEW ─── */}
            {activeView === "history" && !detailRecord && (
              <div className="space-y-3">
                {historyLoading && <p className="text-center text-muted-foreground py-8">Loading history...</p>}
                {!historyLoading && (!history || history.length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No reconciliation history</p>
                    <p className="text-sm">Submit your first shift reconciliation to see history here.</p>
                  </div>
                )}
                {history?.map(record => (
                  <div
                    key={record.id}
                    className="border rounded-lg p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => { setDetailRecord(record); setActiveView("detail"); }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {record.shift_label || "Shift Reconciliation"}
                          </span>
                          {getStatusBadge(record.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          By: {record.submitted_by} · {format(new Date(record.submitted_at), "MMM dd, yyyy HH:mm")}
                        </p>
                        {record.reviewed_by && (
                          <p className="text-xs text-muted-foreground">
                            Reviewed by: {record.reviewed_by} · {record.reviewed_at && format(new Date(record.reviewed_at), "MMM dd, HH:mm")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {record.has_mismatches ? (
                          <div className="text-right">
                            <p className="text-sm font-semibold text-red-600">{record.mismatch_count} mismatch(es)</p>
                          </div>
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── DETAIL VIEW ─── */}
            {activeView === "detail" && detailRecord && (
              <div className="space-y-4">
                <Button variant="outline" size="sm" onClick={() => { setDetailRecord(null); setActiveView("history"); }}>
                  ← Back to History
                </Button>
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Shift:</span>{" "}
                      <span className="font-medium">{detailRecord.shift_label || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      {getStatusBadge(detailRecord.status)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Submitted by:</span>{" "}
                      <span className="font-medium">{detailRecord.submitted_by}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Submitted at:</span>{" "}
                      <span className="font-medium">{format(new Date(detailRecord.submitted_at), "MMM dd, yyyy HH:mm")}</span>
                    </div>
                    {detailRecord.reviewed_by && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Reviewed by:</span>{" "}
                          <span className="font-medium">{detailRecord.reviewed_by}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reviewed at:</span>{" "}
                          <span className="font-medium">{detailRecord.reviewed_at && format(new Date(detailRecord.reviewed_at), "MMM dd, HH:mm")}</span>
                        </div>
                      </>
                    )}
                    {detailRecord.review_notes && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Review Notes:</span>{" "}
                        <span className="font-medium">{detailRecord.review_notes}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
                <h3 className="font-semibold">Comparison Details</h3>
                {renderReport(detailRecord.comparison_result || [], false)}

                {/* Approve / Reject actions for pending records */}
                {detailRecord.status === "pending_review" && detailRecord.has_mismatches && (
                  <div className="border rounded-lg p-4 bg-amber-50 space-y-3">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="font-semibold">Mismatches detected — Action required</span>
                    </div>
                    {canApprove ? (
                      <>
                        <Textarea
                          placeholder="Add review notes (optional)..."
                          value={reviewNotes}
                          onChange={e => setReviewNotes(e.target.value)}
                          className="bg-white"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={async () => {
                              try {
                                const { error } = await supabase
                                  .from("shift_reconciliations")
                                  .update({
                                    status: "approved",
                                    reviewed_by: user?.email || user?.id || "unknown",
                                    reviewed_at: new Date().toISOString(),
                                    review_notes: reviewNotes || null,
                                  })
                                  .eq("id", detailRecord.id);
                                if (error) throw error;
                                toast({ title: "✅ Approved", description: "Shift reconciliation approved." });
                                setReviewNotes("");
                                setDetailRecord({ ...detailRecord, status: "approved", reviewed_by: user?.email || user?.id || "unknown", reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null });
                                queryClient.invalidateQueries({ queryKey: ["shift_reconciliations"] });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve Anyway
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              try {
                                const { error } = await supabase
                                  .from("shift_reconciliations")
                                  .update({
                                    status: "rejected",
                                    reviewed_by: user?.email || user?.id || "unknown",
                                    reviewed_at: new Date().toISOString(),
                                    review_notes: reviewNotes || null,
                                  })
                                  .eq("id", detailRecord.id);
                                if (error) throw error;
                                toast({ title: "❌ Rejected", description: "Shift reconciliation rejected." });
                                setReviewNotes("");
                                setDetailRecord({ ...detailRecord, status: "rejected", reviewed_by: user?.email || user?.id || "unknown", reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null });
                                queryClient.invalidateQueries({ queryKey: ["shift_reconciliations"] });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">You don't have permission to approve or reject. Please contact an authorized reviewer.</p>
                    )}
                  </div>
                )}

                {/* Show approved/rejected status confirmation */}
                {detailRecord.status === "approved" && (
                  <div className="border rounded-lg p-4 bg-green-50 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-semibold text-green-700">Approved</p>
                      <p className="text-sm text-green-600">
                        {detailRecord.reviewed_by && `By ${detailRecord.reviewed_by}`}
                        {detailRecord.reviewed_at && ` on ${format(new Date(detailRecord.reviewed_at), "MMM dd, yyyy HH:mm")}`}
                      </p>
                    </div>
                  </div>
                )}
                {detailRecord.status === "rejected" && (
                  <div className="border rounded-lg p-4 bg-red-50 flex items-center gap-3">
                    <XCircle className="h-6 w-6 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-700">Rejected</p>
                      <p className="text-sm text-red-600">
                        {detailRecord.reviewed_by && `By ${detailRecord.reviewed_by}`}
                        {detailRecord.reviewed_at && ` on ${format(new Date(detailRecord.reviewed_at), "MMM dd, yyyy HH:mm")}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
