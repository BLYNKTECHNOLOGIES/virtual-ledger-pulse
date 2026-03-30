import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveBankAccounts } from "@/hooks/useActiveBankAccounts";
import { captureSellerPaymentDetails } from "@/hooks/useSellerPaymentCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Plus, CheckCircle2, FileSpreadsheet, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface BeneficiaryRecord {
  id: string;
  account_number: string;
  account_holder_name: string | null;
  ifsc_code: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_opening_branch: string | null;
  source_order_number: string | null;
  client_name: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BankAddition {
  id: string;
  beneficiary_id: string;
  bank_account_id: string;
  added_at: string;
  added_by: string | null;
}

interface BankBulkFormat {
  id: string;
  bank_key: string;
  bank_display_name: string;
  columns: ColumnDef[];
  default_values: Record<string, string>;
  is_active: boolean;
}

interface ColumnDef {
  key: string;
  header: string;
  source: string; // 'account_number' | 'ifsc_code' | 'account_holder_name' | 'default'
  max_length?: number;
  strip_special?: boolean;
}

// Steps in the export dialog
type ExportStep = "configure" | "review";

export function BeneficiaryManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiaryRecord | null>(null);
  const [selectedBankId, setSelectedBankId] = useState("");

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStep, setExportStep] = useState<ExportStep>("configure");
  const [exportBankKey, setExportBankKey] = useState("");
  const [exportRowCount, setExportRowCount] = useState("10");
  const [exportedBeneficiaries, setExportedBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [selectedConfirmIds, setSelectedConfirmIds] = useState<Set<string>>(new Set());

  const { data: activeBanks } = useActiveBankAccounts();

  // Fetch configured bank bulk formats
  const { data: bulkFormats, error: bulkFormatsError } = useQuery({
    queryKey: ["bank_bulk_formats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_bulk_formats")
        .select("*")
        .eq("is_active", true)
        .order("bank_display_name");
      if (error) {
        console.error("Failed to fetch bank_bulk_formats:", error);
        throw error;
      }
      return (data as unknown as BankBulkFormat[]).map((f) => ({
        ...f,
        columns: typeof f.columns === "string" ? JSON.parse(f.columns) : f.columns,
        default_values: typeof f.default_values === "string" ? JSON.parse(f.default_values) : f.default_values,
      }));
    },
    staleTime: 30_000,
    retry: 2,
  });

  // Capture live seller bank details on page load
  useEffect(() => {
    let cancelled = false;
    const captureNow = async () => {
      try {
        const { checked } = await captureSellerPaymentDetails();
        if (!cancelled && checked > 0) {
          queryClient.invalidateQueries({ queryKey: ["beneficiary_records"] });
        }
      } catch (error) {
        console.warn("[BeneficiaryManagement] Live beneficiary capture failed:", error);
      }
    };
    captureNow();
    return () => { cancelled = true; };
  }, [queryClient]);

  // Fetch all beneficiary records
  const { data: beneficiaries, isLoading } = useQuery({
    queryKey: ["beneficiary_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficiary_records" as any)
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      // Filter out UPI-style accounts (contain '@') — only bank transfer/IMPS records belong here
      return (data as unknown as BeneficiaryRecord[]).filter(
        (r) => !r.account_number?.includes('@')
      );
    },
  });

  // Fetch all bank additions
  const { data: bankAdditions } = useQuery({
    queryKey: ["beneficiary_bank_additions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficiary_bank_additions" as any)
        .select("*");
      if (error) throw error;
      return data as unknown as BankAddition[];
    },
  });

  // Build map: beneficiary_id → bank_account_ids[]
  const additionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    bankAdditions?.forEach((ba) => {
      const existing = map.get(ba.beneficiary_id) || [];
      existing.push(ba.bank_account_id);
      map.set(ba.beneficiary_id, existing);
    });
    return map;
  }, [bankAdditions]);

  // Build map: bank_account_id → Set of beneficiary_ids already added
  const additionsByBankAccountId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    bankAdditions?.forEach((ba) => {
      const existing = map.get(ba.bank_account_id) || new Set<string>();
      existing.add(ba.beneficiary_id);
      map.set(ba.bank_account_id, existing);
    });
    return map;
  }, [bankAdditions]);

  const matchesBankFormat = (
    bank: { bank_name: string; account_name: string },
    format: BankBulkFormat
  ) => {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const bankName = normalize(bank.bank_name || "");
    const accountName = normalize(bank.account_name || "");
    const key = normalize(format.bank_key || "");
    const display = normalize(format.bank_display_name || "");

    const includesToken = (token: string) =>
      bankName.includes(token) || accountName.includes(token);

    // Handle aliases like "PSB BANK" and full name variants
    if (key === "psb") {
      return includesToken("psb") || (includesToken("punjab") && includesToken("sind"));
    }

    return (display && includesToken(display)) || (key && includesToken(key));
  };

  // Filter beneficiaries
  const filtered = useMemo(() => {
    if (!beneficiaries) return [];
    if (!searchQuery.trim()) return beneficiaries;
    const q = searchQuery.toLowerCase();
    return beneficiaries.filter(
      (b) =>
        b.account_number?.toLowerCase().includes(q) ||
        b.account_holder_name?.toLowerCase().includes(q) ||
        b.ifsc_code?.toLowerCase().includes(q) ||
        b.account_type?.toLowerCase().includes(q) ||
        b.account_opening_branch?.toLowerCase().includes(q)
    );
  }, [beneficiaries, searchQuery]);

  // Add to bank mutation (individual)
  const addToBankMutation = useMutation({
    mutationFn: async ({ beneficiaryId, bankAccountId }: { beneficiaryId: string; bankAccountId: string }) => {
      const { error } = await supabase.from("beneficiary_bank_additions" as any).insert({
        beneficiary_id: beneficiaryId,
        bank_account_id: bankAccountId,
        added_at: new Date().toISOString(),
      });
      if (error) {
        if (error.code === "23505") throw new Error("Already added to this bank");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Beneficiary marked as added to bank" });
      queryClient.invalidateQueries({ queryKey: ["beneficiary_bank_additions"] });
      setShowBankDialog(false);
      setSelectedBeneficiary(null);
      setSelectedBankId("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Bulk confirm addition mutation
  const bulkConfirmMutation = useMutation({
    mutationFn: async ({ beneficiaryIds, bankAccountId }: { beneficiaryIds: string[]; bankAccountId: string }) => {
      for (const bId of beneficiaryIds) {
        await supabase.from("beneficiary_bank_additions" as any).upsert(
          { beneficiary_id: bId, bank_account_id: bankAccountId, added_at: new Date().toISOString() } as any,
          { onConflict: "beneficiary_id,bank_account_id" }
        );
      }
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Beneficiaries marked as added to the selected bank" });
      queryClient.invalidateQueries({ queryKey: ["beneficiary_bank_additions"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiary_records"] });
      resetExportDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetExportDialog = () => {
    setShowExportDialog(false);
    setExportStep("configure");
    setExportBankKey("");
    setExportRowCount("10");
    setExportedBeneficiaries([]);
    setSelectedConfirmIds(new Set());
  };

  // Strip special characters, keep only alphanumeric and spaces
  const sanitizeName = (name: string, maxLen?: number): string => {
    let clean = name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (maxLen && clean.length > maxLen) clean = clean.substring(0, maxLen).trim();
    return clean;
  };

  // Get cell value for a beneficiary based on column definition
  // For PSB format: payee_type is WITHIN if beneficiary bank is PSB, else OUTSIDE
  // For PSB format: nick_name is simply first 10 chars of sanitized name
  // For PSB format: txn_limit is always 1,00,00,000 (1 crore)
  const getCellValue = (b: BeneficiaryRecord, col: ColumnDef, defaults: Record<string, string>, bankKey: string): string => {
    if (col.source === "default") {
      // PSB-specific: auto-detect WITHIN/OUTSIDE based on beneficiary's bank
      if (bankKey === "PSB" && col.key === "payee_type") {
        const benBank = (b.bank_name || "").toLowerCase();
        const isPSB = benBank.includes("punjab") && benBank.includes("sind");
        return isPSB ? "WITHIN" : "OUTSIDE";
      }
      // PSB-specific: transaction limit is 1 crore
      if (bankKey === "PSB" && col.key === "txn_limit") {
        return "10000000.00";
      }
      return defaults[col.key] || "";
    }

    let value = "";
    switch (col.source) {
      case "account_number":
        value = b.account_number || "";
        break;
      case "ifsc_code":
        value = b.ifsc_code || "";
        // PSB-specific: if beneficiary is PSB bank, IFSC should be blank
        if (bankKey === "PSB") {
          const benBank = (b.bank_name || "").toLowerCase();
          const isPSB = benBank.includes("punjab") && benBank.includes("sind");
          if (isPSB) value = "";
        }
        break;
      case "account_holder_name":
        value = b.account_holder_name || "";
        if (col.strip_special) {
          // Remove special chars, keep alphanumeric + space
          value = value.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
          if (col.key === "nick_name") {
            // For PSB: simply trim to first 10 characters
            value = value.substring(0, col.max_length || 10).trim();
          } else {
            value = value.substring(0, col.max_length || 32).trim();
          }
        }
        break;
      default:
        value = (b as any)[col.source] || "";
    }
    return value;
  };

  // Handle export: generate CSV + show review step
  const handleGenerateExport = () => {
    const selectedFormat = bulkFormats?.find((f) => f.bank_key === exportBankKey);
    if (!selectedFormat) {
      toast({ title: "Error", description: "No format configuration found", variant: "destructive" });
      return;
    }

    const count = parseInt(exportRowCount) || 10;

    const matchingBankAccountIds = new Set(
      (activeBanks || [])
        .filter((ba) => matchesBankFormat(ba, selectedFormat))
        .map((ba) => ba.id)
    );

    const addedBeneficiaryIds = new Set<string>();
    matchingBankAccountIds.forEach((bankAccountId) => {
      const additions = additionsByBankAccountId.get(bankAccountId);
      if (additions) additions.forEach((bId) => addedBeneficiaryIds.add(bId));
    });

    // Filter: only beneficiaries NOT yet added to this bank
    const eligible = (beneficiaries || []).filter((b) => !addedBeneficiaryIds.has(b.id));
    const toExport = eligible.slice(0, count);

    if (toExport.length === 0) {
      toast({ title: "No Records", description: "All beneficiaries have already been exported/added to this bank", variant: "destructive" });
      return;
    }

    // Generate CSV in the exact bank format
    const columns = selectedFormat.columns;
    const defaults = selectedFormat.default_values;

    const wsData = toExport.map((b) => {
      const row: Record<string, string> = {};
      columns.forEach((col: ColumnDef) => {
        row[col.header] = getCellValue(b, col, defaults, selectedFormat.bank_key);
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Beneficiaries");
    XLSX.writeFile(wb, `${selectedFormat.bank_key}_Bulk_Payee_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`, { bookType: "xlsx" });

    // Move to review step
    setExportedBeneficiaries(toExport);
    setSelectedConfirmIds(new Set(toExport.map((b) => b.id))); // Select all by default
    setExportStep("review");
  };

  // Handle confirm submission
  const handleConfirmSubmit = () => {
    if (selectedConfirmIds.size === 0) {
      toast({ title: "No Selection", description: "Please select at least one beneficiary", variant: "destructive" });
      return;
    }

    const selectedFormat = bulkFormats?.find((f) => f.bank_key === exportBankKey);
    if (!selectedFormat) return;

    // Find matching bank account for this format
    const matchingBankAccount = activeBanks?.find((ba) => matchesBankFormat(ba, selectedFormat));

    if (!matchingBankAccount) {
      toast({
        title: "Error",
        description: `No active bank account found for ${selectedFormat.bank_display_name}. Please ensure you have an active account for this bank in the system.`,
        variant: "destructive",
      });
      return;
    }

    bulkConfirmMutation.mutate({
      beneficiaryIds: Array.from(selectedConfirmIds),
      bankAccountId: matchingBankAccount.id,
    });
  };

  const toggleConfirmId = (id: string) => {
    setSelectedConfirmIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedConfirmIds.size === exportedBeneficiaries.length) {
      setSelectedConfirmIds(new Set());
    } else {
      setSelectedConfirmIds(new Set(exportedBeneficiaries.map((b) => b.id)));
    }
  };

  const getBankName = (bankId: string) => {
    return activeBanks?.find((b) => b.id === bankId)?.account_name || "Unknown";
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Beneficiary Records</h2>
          <p className="text-sm text-muted-foreground">
            {beneficiaries?.length || 0} unique beneficiaries tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search account number, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowExportDialog(true); setExportStep("configure"); }}>
            <Download className="h-3.5 w-3.5" />
            Export for Bank
          </Button>
        </div>
      </div>

      {/* List View */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Account Number</TableHead>
                  <TableHead className="text-xs">Holder Name</TableHead>
                  <TableHead className="text-xs">IFSC</TableHead>
                  <TableHead className="text-xs">Account Type</TableHead>
                  <TableHead className="text-xs">Opening Branch</TableHead>
                  <TableHead className="text-xs">First Seen</TableHead>
                  <TableHead className="text-xs">Banks Added To</TableHead>
                  <TableHead className="text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      {searchQuery ? "No matching beneficiaries found" : "No beneficiary records yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => {
                    const addedBanks = additionMap.get(b.id) || [];
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs font-mono">{b.account_number}</TableCell>
                        <TableCell className="text-xs">{b.account_holder_name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{b.ifsc_code || "—"}</TableCell>
                        <TableCell className="text-xs">{b.account_type || "—"}</TableCell>
                        <TableCell className="text-xs">{b.account_opening_branch || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(b.first_seen_at), "dd MMM yy")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {addedBanks.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {addedBanks.map((bankId) => (
                                <Badge key={bankId} variant="outline" className="text-[9px] gap-0.5">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                                  {getBankName(bankId)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Not added</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1"
                            onClick={() => {
                              setSelectedBeneficiary(b);
                              setShowBankDialog(true);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Add to Bank
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Individual Add to Bank Dialog */}
      <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Beneficiary to Bank</DialogTitle>
          </DialogHeader>
          {selectedBeneficiary && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-md p-3 space-y-1 text-xs">
                <p><span className="text-muted-foreground">Account:</span> {selectedBeneficiary.account_number}</p>
                <p><span className="text-muted-foreground">Name:</span> {selectedBeneficiary.account_holder_name || "—"}</p>
                <p><span className="text-muted-foreground">IFSC:</span> {selectedBeneficiary.ifsc_code || "—"}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Select Bank</Label>
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose active bank..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBanks?.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {bank.account_name} — {bank.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              disabled={!selectedBankId || addToBankMutation.isPending}
              onClick={() => {
                if (selectedBeneficiary && selectedBankId) {
                  addToBankMutation.mutate({ beneficiaryId: selectedBeneficiary.id, bankAccountId: selectedBankId });
                }
              }}
            >
              {addToBankMutation.isPending ? "Adding..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog — Two Steps */}
      <Dialog open={showExportDialog} onOpenChange={(open) => { if (!open) resetExportDialog(); else setShowExportDialog(true); }}>
        <DialogContent className="max-w-2xl">
          {exportStep === "configure" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Export Beneficiaries for Bank Bulk Upload
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Select Bank</Label>
                  <p className="text-xs text-muted-foreground">Only banks with a configured bulk upload format are shown.</p>
                  <Select value={exportBankKey} onValueChange={setExportBankKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose bank..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bulkFormats?.map((f) => (
                        <SelectItem key={f.bank_key} value={f.bank_key}>
                          {f.bank_display_name} ({f.bank_key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {bulkFormats?.length === 0 && (
                    <p className="text-xs text-destructive">No bank bulk formats configured yet.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Number of Rows</Label>
                  <p className="text-xs text-muted-foreground">How many new beneficiaries to include in the export.</p>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={exportRowCount}
                    onChange={(e) => setExportRowCount(e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={resetExportDialog}>Cancel</Button>
                <Button size="sm" disabled={!exportBankKey} onClick={handleGenerateExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Generate & Download
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Confirm Successful Bank Additions</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                {exportedBeneficiaries.length} beneficiaries were exported for <strong>{bulkFormats?.find((f) => f.bank_key === exportBankKey)?.bank_display_name}</strong>.
                Select the ones that were successfully added to the bank, then click Submit.
              </p>

              {/* Select All */}
              <div className="flex items-center gap-2 py-1 border-b">
                <Checkbox
                  checked={selectedConfirmIds.size === exportedBeneficiaries.length && exportedBeneficiaries.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs font-medium">Select All ({selectedConfirmIds.size}/{exportedBeneficiaries.length})</span>
              </div>

              {/* Beneficiary list */}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {exportedBeneficiaries.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedConfirmIds.has(b.id)}
                      onCheckedChange={() => toggleConfirmId(b.id)}
                    />
                    <div className="flex-1 text-xs space-y-0.5">
                      <div className="font-medium">{b.account_holder_name || "Unknown"}</div>
                      <div className="text-muted-foreground font-mono">{b.account_number} • {b.ifsc_code || "—"}</div>
                    </div>
                  </label>
                ))}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={resetExportDialog}>Close</Button>
                <Button
                  size="sm"
                  disabled={selectedConfirmIds.size === 0 || bulkConfirmMutation.isPending}
                  onClick={handleConfirmSubmit}
                >
                  {bulkConfirmMutation.isPending ? "Saving..." : `Submit (${selectedConfirmIds.size} selected)`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
