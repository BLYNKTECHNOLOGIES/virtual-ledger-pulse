import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, ShieldAlert, RefreshCw, Anchor, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ChainRow {
  out_wallet_id: string;
  out_total_rows: number;
  out_first_break_id: string | null;
  out_first_break_seq: number | null;
  out_expected_hash: string | null;
  out_actual_hash: string | null;
  out_is_intact: boolean;
}

interface AnchorRow {
  id: string;
  anchored_at: string;
  wallet_id: string | null;
  head_sequence_no: number;
  head_row_hash: string;
  tx_count: number;
}

interface TamperRow {
  id: string;
  attempted_at: string;
  attempted_by: string | null;
  attempted_role: string | null;
  operation: string;
  target_tx_id: string | null;
  blocked: boolean;
  reason: string | null;
}

const shortHash = (h?: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—");
const shortId = (id?: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

interface AssetBalRow {
  wallet_id: string;
  wallet_name: string;
  asset_code: string;
  intact: boolean;
  rows_checked: number;
  break_transaction_id: string | null;
  break_reason: string | null;
}

export function LedgerIntegrityTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verification, setVerification] = useState<ChainRow[] | null>(null);
  const [assetVerification, setAssetVerification] = useState<AssetBalRow[] | null>(null);

  const verifyAssetBalancesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_all_wallet_asset_running_balances");
      if (error) throw error;
      return (data || []) as AssetBalRow[];
    },
    onSuccess: (rows) => {
      setAssetVerification(rows);
      const broken = rows.filter((r) => !r.intact).length;
      toast({
        title: broken === 0 ? "All asset closing balances intact" : "Closing-balance drift detected",
        description: `${rows.length} (wallet × asset) pair(s) checked, ${broken} broken.`,
        variant: broken === 0 ? "default" : "destructive",
      });
    },
    onError: (e: any) =>
      toast({ title: "Asset balance verification failed", description: e?.message || String(e), variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_wallet_chain", {
        p_wallet_id: undefined as any,
      });
      if (error) throw error;
      return (data || []) as ChainRow[];
    },
    onSuccess: (rows) => {
      setVerification(rows);
      const broken = rows.filter((r) => !r.out_is_intact).length;
      if (broken === 0) {
        toast({
          title: "Chain intact",
          description: `All ${rows.length} wallet chain(s) verified successfully.`,
        });
      } else {
        toast({
          title: "Chain integrity failure",
          description: `${broken} wallet chain(s) have a hash mismatch — see details below.`,
          variant: "destructive",
        });
      }
    },
    onError: (e: any) =>
      toast({
        title: "Verification failed",
        description: e?.message || String(e),
        variant: "destructive",
      }),
  });

  const anchorMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("snapshot_ledger_anchor");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast({
        title: "Anchor recorded",
        description: `${n} new ledger anchor(s) saved.`,
      });
      queryClient.invalidateQueries({ queryKey: ["ledger_anchors"] });
    },
    onError: (e: any) =>
      toast({
        title: "Anchor failed",
        description: e?.message || String(e),
        variant: "destructive",
      }),
  });

  const { data: anchors, isLoading: anchorsLoading } = useQuery({
    queryKey: ["ledger_anchors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_anchors")
        .select("id, anchored_at, wallet_id, head_sequence_no, head_row_hash, tx_count")
        .order("anchored_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AnchorRow[];
    },
  });

  const { data: tamperLog, isLoading: tamperLoading } = useQuery({
    queryKey: ["ledger_tamper_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_tamper_log")
        .select(
          "id, attempted_at, attempted_by, attempted_role, operation, target_tx_id, blocked, reason"
        )
        .order("attempted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as TamperRow[];
    },
  });

  const { data: chainStats } = useQuery({
    queryKey: ["ledger_chain_stats"],
    queryFn: async () => {
      const { count } = await supabase
        .from("wallet_transactions")
        .select("*", { count: "exact", head: true });
      const { count: reversals } = await supabase
        .from("wallet_transactions")
        .select("*", { count: "exact", head: true })
        .not("reverses_transaction_id", "is", null);
      return {
        total: count || 0,
        reversals: reversals || 0,
      };
    },
  });

  const blockedAttempts = (tamperLog || []).filter((t) => t.blocked).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Ledger Rows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {chainStats?.total?.toLocaleString("en-IN") ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reversal Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {chainStats?.reversals?.toLocaleString("en-IN") ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Anchors Recorded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{anchors?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Blocked Mutation Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                blockedAttempts > 0 ? "text-destructive" : ""
              }`}
            >
              {blockedAttempts}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Chain Verification
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Walks every wallet's transaction chain, recomputes each SHA256 hash,
                and reports the first mismatch (if any).
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => anchorMutation.mutate()}
                disabled={anchorMutation.isPending}
              >
                <Anchor className="h-4 w-4 mr-2" />
                {anchorMutation.isPending ? "Anchoring…" : "Snapshot Anchor"}
              </Button>
              <Button
                variant="outline"
                onClick={() => verifyAssetBalancesMutation.mutate()}
                disabled={verifyAssetBalancesMutation.isPending}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                {verifyAssetBalancesMutation.isPending ? "Checking…" : "Verify Per-Asset Closing Balances"}
              </Button>
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${
                    verifyMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                {verifyMutation.isPending ? "Verifying…" : "Run Chain Verification"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!verification && (
            <p className="text-sm text-muted-foreground">
              Click "Run Chain Verification" to walk the entire ledger and confirm
              tamper-free state.
            </p>
          )}
          {verification && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Break Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verification.map((r) => (
                  <TableRow key={r.out_wallet_id}>
                    <TableCell className="font-mono text-xs">
                      {shortId(r.out_wallet_id)}
                    </TableCell>
                    <TableCell className="text-right">{r.out_total_rows}</TableCell>
                    <TableCell>
                      {r.out_is_intact ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Intact
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <ShieldAlert className="h-3 w-3 mr-1" />
                          BROKEN
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.out_is_intact ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1 font-mono">
                          <div>
                            seq <strong>{r.out_first_break_seq}</strong> ·{" "}
                            {shortId(r.out_first_break_id)}
                          </div>
                          <div className="text-muted-foreground">
                            expected {shortHash(r.out_expected_hash)} got{" "}
                            {shortHash(r.out_actual_hash)}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Anchor className="h-5 w-5 text-primary" />
            Recent Ledger Anchors
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Per-wallet chain-head checkpoints. Captured automatically every day at
            00:05 UTC and on every manual snapshot.
          </p>
        </CardHeader>
        <CardContent>
          {anchorsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !anchors || anchors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No anchors recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anchored At</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead className="text-right">Head Seq</TableHead>
                  <TableHead className="text-right">Tx Count</TableHead>
                  <TableHead>Head Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anchors.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">
                      {format(new Date(a.anchored_at), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortId(a.wallet_id)}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.head_sequence_no}
                    </TableCell>
                    <TableCell className="text-right">{a.tx_count}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortHash(a.head_row_hash)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Tamper Log
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Every attempt to UPDATE or DELETE a ledger row is recorded here — even
            when blocked. The only "allowed" entries are the
            <code className="mx-1 px-1 rounded bg-muted text-xs">
              ALLOWED_FLAG_UPDATE
            </code>
            rows produced when an original row is marked as reversed.
          </p>
        </CardHeader>
        <CardContent>
          {tamperLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !tamperLog || tamperLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No mutation attempts recorded — the ledger has been clean since
              activation.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attempted At</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Target Tx</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tamperLog.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">
                      {format(new Date(t.attempted_at), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.operation}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortId(t.target_tx_id)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.attempted_role || "—"}
                    </TableCell>
                    <TableCell>
                      {t.blocked ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                          Allowed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                      {t.reason || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
