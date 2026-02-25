import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, RefreshCw, Pencil, Ruler, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";

interface SizeRange {
  id: string;
  name: string;
  min_amount: number;
  max_amount: number | null;
  currency: string;
  is_active: boolean;
  order_type: string;
}

const ORDER_TYPE_CONFIG: Record<string, { label: string; icon: typeof ArrowDownCircle; color: string }> = {
  BUY: { label: "Buy", icon: ArrowDownCircle, color: "text-green-400" },
  SELL: { label: "Sell", icon: ArrowUpCircle, color: "text-red-400" },
  BOTH: { label: "Both", icon: ArrowLeftRight, color: "text-blue-400" },
};

export function TerminalSizeRanges() {
  const { hasPermission } = useTerminalAuth();
  const canManage = hasPermission("terminal_users_manage");

  const [ranges, setRanges] = useState<SizeRange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [orderType, setOrderType] = useState("BOTH");
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("terminal_order_size_ranges")
      .select("*")
      .order("min_amount", { ascending: true });
    setRanges((data as SizeRange[]) || []);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditingId(null); setName(""); setMinAmount(""); setMaxAmount(""); setOrderType("BOTH");
    setDialogOpen(true);
  };

  const openEdit = (r: SizeRange) => {
    setEditingId(r.id);
    setName(r.name);
    setMinAmount(String(r.min_amount));
    setMaxAmount(r.max_amount !== null ? String(r.max_amount) : "");
    setOrderType(r.order_type || "BOTH");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        min_amount: parseFloat(minAmount) || 0,
        max_amount: maxAmount.trim() ? parseFloat(maxAmount) : null,
        order_type: orderType,
      };
      if (editingId) {
        const { error } = await supabase.from("terminal_order_size_ranges").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Size range updated");
      } else {
        const { error } = await supabase.from("terminal_order_size_ranges").insert(payload);
        if (error) throw error;
        toast.success("Size range added");
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("terminal_order_size_ranges").update({ is_active: !current }).eq("id", id);
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Define order size categories for assignment routing and jurisdiction control.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Button size="sm" className="h-8 text-xs" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Range
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : ranges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Ruler className="h-10 w-10 opacity-20" />
          <p className="text-sm">No size ranges defined.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {ranges.map(r => {
            const typeConf = ORDER_TYPE_CONFIG[r.order_type] || ORDER_TYPE_CONFIG.BOTH;
            const TypeIcon = typeConf.icon;
            return (
              <div key={r.id} className="border border-border rounded-lg p-4 bg-muted/5 hover:bg-muted/10 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={r.is_active
                    ? "bg-primary/20 text-primary border-primary/30 text-xs"
                    : "bg-muted/20 text-muted-foreground border-muted/30 text-xs"
                  }>
                    {r.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground font-mono">
                    ₹{r.min_amount.toLocaleString()} – {r.max_amount !== null ? `₹${r.max_amount.toLocaleString()}` : '∞'}
                  </span>
                  <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0.5">
                    <TypeIcon className={`h-3 w-3 ${typeConf.color}`} />
                    {typeConf.label}
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r.id, r.is_active)} className="scale-75" />
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(r)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} modal={false}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Size Range" : "Add Size Range"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Small Sales" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Order Type</label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                  <SelectItem value="BOTH">Both (Buy & Sell)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Min Amount (₹)</label>
                <Input value={minAmount} onChange={e => setMinAmount(e.target.value)} type="number" placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Max Amount (₹)</label>
                <Input value={maxAmount} onChange={e => setMaxAmount(e.target.value)} type="number" placeholder="No limit" className="h-9 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingId ? "Save" : "Add Range"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
