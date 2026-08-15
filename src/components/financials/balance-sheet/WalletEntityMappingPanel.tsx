import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

const UNASSIGNED = "__unassigned__";

interface WalletRow {
  id: string;
  wallet_name: string;
  chain_name: string | null;
  is_active: boolean | null;
}

interface MapRow {
  wallet_id: string;
  subsidiary_id: string | null;
}

interface EntityOption {
  subsidiary_id: string;
  legal_name: string;
}

/**
 * Balance-sheet only. Writes exclusively to fin_wallet_entity_map and its log.
 * The `wallets` table is never updated by this screen.
 */
export function WalletEntityMappingPanel({ entities }: { entities: EntityOption[] }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fin-wallet-entity-map"],
    queryFn: async () => {
      const [wallets, maps] = await Promise.all([
        supabase.from("wallets").select("id, wallet_name, chain_name, is_active").order("wallet_name"),
        supabase.from("fin_wallet_entity_map" as any).select("wallet_id, subsidiary_id"),
      ]);
      if (wallets.error) throw wallets.error;
      if (maps.error) throw maps.error;
      return {
        wallets: (wallets.data || []) as unknown as WalletRow[],
        maps: (maps.data || []) as unknown as MapRow[],
      };
    },
  });

  const mapFor = (walletId: string) =>
    data?.maps.find((m) => m.wallet_id === walletId)?.subsidiary_id ?? null;

  const assign = async (walletId: string, value: string) => {
    const next = value === UNASSIGNED ? null : value;
    const previous = mapFor(walletId);
    setSaving(walletId);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      const { error } = await supabase.from("fin_wallet_entity_map" as any).upsert(
        {
          wallet_id: walletId,
          subsidiary_id: next,
          previous_subsidiary_id: previous,
          assigned_by: uid,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "wallet_id" },
      );
      if (error) throw error;

      await supabase.from("fin_wallet_entity_assignment_log" as any).insert({
        wallet_id: walletId,
        old_subsidiary_id: previous,
        new_subsidiary_id: next,
        changed_by: uid,
      } as any);

      await qc.invalidateQueries({ queryKey: ["fin-wallet-entity-map"] });
      await qc.invalidateQueries({ queryKey: ["fin-balance-sheet"] });
      toast.success("Wallet mapping updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not update the wallet mapping");
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const wallets = data?.wallets || [];
  const unmapped = wallets.filter((w) => !mapFor(w.id)).length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Wallet to company mapping</h4>
        </div>
        <Badge variant={unmapped ? "secondary" : "outline"} className="text-[10px] uppercase">
          {unmapped} unmapped
        </Badge>
      </div>
      <div className="divide-y divide-border/60">
        {wallets.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{w.wallet_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {w.chain_name || "—"} {w.is_active === false ? "· inactive" : ""}
              </p>
            </div>
            <Select
              value={mapFor(w.id) ?? UNASSIGNED}
              onValueChange={(v) => assign(w.id, v)}
              disabled={saving === w.id}
            >
              <SelectTrigger className="w-[240px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned (stays in pool)</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.subsidiary_id} value={e.subsidiary_id}>
                    {e.legal_name?.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {!wallets.length && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No wallets found.</p>
        )}
      </div>
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Mappings are stored separately for reporting. The wallet records themselves are never
        modified. Unmapped wallets stay in the unattributed pool and are excluded from every company
        statement.
      </p>
    </div>
  );
}
