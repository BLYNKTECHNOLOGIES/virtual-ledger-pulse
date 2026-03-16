import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveBankAccounts } from "@/hooks/useActiveBankAccounts";
import { captureSellerPaymentDetails } from "@/hooks/useSellerPaymentCapture";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Building, Plus, CheckCircle2, Users, FileSpreadsheet } from "lucide-react";
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

export function BeneficiaryManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportCount, setExportCount] = useState("10");
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiaryRecord | null>(null);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [showExportBankDialog, setShowExportBankDialog] = useState(false);
  const [exportedBeneficiaryIds, setExportedBeneficiaryIds] = useState<string[]>([]);
  const [selectedExportBankIds, setSelectedExportBankIds] = useState<string[]>([]);

  const { data: activeBanks } = useActiveBankAccounts();

  // Capture live seller bank details on page load so beneficiary list reflects active IMPS/Bank orders
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

    return () => {
      cancelled = true;
    };
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
      return data as unknown as BeneficiaryRecord[];
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

  // Build a map: beneficiary_id → bank_account_ids[]
  const additionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    bankAdditions?.forEach((ba) => {
      const existing = map.get(ba.beneficiary_id) || [];
      existing.push(ba.bank_account_id);
      map.set(ba.beneficiary_id, existing);
    });
    return map;
  }, [bankAdditions]);

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

  // Add to bank mutation
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

  // Bulk add to bank after export
  const bulkAddMutation = useMutation({
    mutationFn: async ({ beneficiaryIds, bankAccountIds }: { beneficiaryIds: string[]; bankAccountIds: string[] }) => {
      const rows = beneficiaryIds.flatMap((bId) =>
        bankAccountIds.map((baId) => ({
          beneficiary_id: bId,
          bank_account_id: baId,
          added_at: new Date().toISOString(),
        }))
      );
      // Insert ignoring conflicts
      for (const row of rows) {
        await supabase.from("beneficiary_bank_additions" as any).upsert(row as any, { onConflict: "beneficiary_id,bank_account_id" });
      }
      // Update exported_at
      for (const bId of beneficiaryIds) {
        await supabase.from("beneficiary_records" as any).update({ exported_at: new Date().toISOString() }).eq("id", bId);
      }
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Bank additions recorded for exported beneficiaries" });
      queryClient.invalidateQueries({ queryKey: ["beneficiary_bank_additions"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiary_records"] });
      setShowExportBankDialog(false);
      setExportedBeneficiaryIds([]);
      setSelectedExportBankIds([]);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Export CSV
  const handleExport = () => {
    const count = parseInt(exportCount) || 10;
    // Get beneficiaries that haven't been exported yet, or all if not enough
    const unexported = filtered.filter((b) => !b.exported_at);
    const toExport = unexported.length >= count ? unexported.slice(0, count) : filtered.slice(0, count);

    if (toExport.length === 0) {
      toast({ title: "No Records", description: "No beneficiary records to export", variant: "destructive" });
      return;
    }

    const wsData = toExport.map((b, i) => ({
      "Sr No": i + 1,
      "Account Holder Name": b.account_holder_name || "",
      "Account Number": b.account_number,
      "IFSC Code": b.ifsc_code || "",
      "Bank Name": b.bank_name || "",
      "Account Type": b.account_type || "",
      "Account Opening Branch": b.account_opening_branch || "",
      "Client Name": b.client_name || "",
      "Times Seen": b.occurrence_count,
      "First Seen": b.first_seen_at ? format(new Date(b.first_seen_at), "dd-MM-yyyy") : "",
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Beneficiaries");
    XLSX.writeFile(wb, `beneficiaries_export_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`, { bookType: "csv" });

    // Store exported IDs and open bank selection dialog
    setExportedBeneficiaryIds(toExport.map((b) => b.id));
    setShowExportBankDialog(true);
  };

  const getBankName = (bankId: string) => {
    return activeBanks?.find((b) => b.id === bankId)?.account_name || "Unknown";
  };

  const toggleExportBank = (bankId: string) => {
    setSelectedExportBankIds((prev) =>
      prev.includes(bankId) ? prev.filter((id) => id !== bankId) : [...prev, bankId]
    );
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
        </div>
      </div>

      {/* Export Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Export CSV:</span>
            </div>
            <Select value={exportCount} onValueChange={setExportCount}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">entries</span>
            <Button size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs text-center">Seen</TableHead>
                  <TableHead className="text-xs">First Seen</TableHead>
                  <TableHead className="text-xs">Banks Added To</TableHead>
                  <TableHead className="text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Loading...
                    </TableCell>
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
                        <TableCell className="text-xs">{b.client_name || "—"}</TableCell>
                        <TableCell className="text-xs text-center">
                          <Badge variant="secondary" className="text-[10px]">{b.occurrence_count}</Badge>
                        </TableCell>
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
                <label className="text-xs font-medium">Select Bank</label>
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

      {/* Post-Export Bank Selection Dialog */}
      <Dialog open={showExportBankDialog} onOpenChange={setShowExportBankDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Where were these beneficiaries added?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {exportedBeneficiaryIds.length} beneficiaries exported. Select the bank(s) where you've added them:
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {activeBanks?.map((bank) => (
              <label key={bank.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedExportBankIds.includes(bank.id)}
                  onCheckedChange={() => toggleExportBank(bank.id)}
                />
                <div className="text-xs">
                  <span className="font-medium">{bank.account_name}</span>
                  <span className="text-muted-foreground ml-1">— {bank.bank_name}</span>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowExportBankDialog(false)}>
              Skip
            </Button>
            <Button
              size="sm"
              disabled={selectedExportBankIds.length === 0 || bulkAddMutation.isPending}
              onClick={() => {
                bulkAddMutation.mutate({
                  beneficiaryIds: exportedBeneficiaryIds,
                  bankAccountIds: selectedExportBankIds,
                });
              }}
            >
              {bulkAddMutation.isPending ? "Saving..." : `Mark Added to ${selectedExportBankIds.length} Bank(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
