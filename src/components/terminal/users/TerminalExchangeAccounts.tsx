import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw, Pencil, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";

interface ExchangeAccount {
  id: string;
  account_name: string;
  account_identifier: string;
  exchange_platform: string;
  is_active: boolean;
  created_at: string;
}

export function TerminalExchangeAccounts() {
  const { hasPermission } = useTerminalAuth();
  const canManage = hasPermission("terminal_users_manage");

  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("terminal_exchange_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    setAccounts(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditingId(null);
    setName("");
    setIdentifier("");
    setDialogOpen(true);
  };

  const openEdit = (acc: ExchangeAccount) => {
    setEditingId(acc.id);
    setName(acc.account_name);
    setIdentifier(acc.account_identifier);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !identifier.trim()) {
      toast.error("Name and identifier are required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("terminal_exchange_accounts")
          .update({ account_name: name.trim(), account_identifier: identifier.trim() })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Exchange account updated");
      } else {
        const { error } = await supabase
          .from("terminal_exchange_accounts")
          .insert({ account_name: name.trim(), account_identifier: identifier.trim() });
        if (error) throw error;
        toast.success("Exchange account added");
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (id: string, currentValue: boolean) => {
    const { error } = await supabase
      .from("terminal_exchange_accounts")
      .update({ is_active: !currentValue })
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Manage Binance sub-accounts and exchange endpoints used for order mapping.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Button size="sm" className="h-8 text-xs" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">No exchange accounts configured yet.</p>
          {canManage && <p className="text-xs">Add your first Binance sub-account to start mapping users.</p>}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="text-xs font-medium text-muted-foreground">Account Name</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Identifier</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                {canManage && <TableHead className="text-xs font-medium text-muted-foreground text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(acc => (
                <TableRow key={acc.id} className="border-border">
                  <TableCell className="text-sm font-medium">{acc.account_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{acc.account_identifier}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={acc.is_active
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs"
                      : "bg-muted/20 text-muted-foreground border-muted/30 text-xs"
                    }>
                      {acc.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={acc.is_active}
                          onCheckedChange={() => toggleActive(acc.id, acc.is_active)}
                          className="scale-75"
                        />
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(acc)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Exchange Account" : "Add Exchange Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Binance Main" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account Identifier</label>
              <Input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="e.g. sub-account ID or email" className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingId ? "Save Changes" : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
