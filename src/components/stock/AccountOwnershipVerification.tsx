import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VerifyResult {
  account: string;
  ordersFetchedFromBinance: number;
  alreadyCorrect: number;
  reassignedFromOther: number;
  updated: number;
  notInDb: number;
  pagesScanned: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Authoritative per-account order ownership verification.
 *
 * Calls the live Binance API for each configured account, pulls that account's
 * REAL P2P order history, and (optionally) re-stamps the matching
 * binance_order_history rows with the verified owning account. Dry-run first so
 * you can see exactly how many legacy orders actually belong to each account
 * before any balances are touched.
 */
export function AccountOwnershipVerification() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 365 * DAY_MS).toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, VerifyResult>>({});

  const { data: accounts = [] } = useQuery({
    queryKey: ["exchange-accounts-verify"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_exchange_accounts")
        .select("id, account_name, credential_key, color")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const runVerification = async (accountId: string, credentialKey: string, dryRun: boolean) => {
    setRunningId(accountId + (dryRun ? ":dry" : ":commit"));
    const startTimestamp = new Date(fromDate).getTime();
    const endTimestamp = new Date(toDate).getTime() + DAY_MS - 1;

    const agg: VerifyResult = {
      account: accountId,
      ordersFetchedFromBinance: 0,
      alreadyCorrect: 0,
      reassignedFromOther: 0,
      updated: 0,
      notInDb: 0,
      pagesScanned: 0,
    };

    try {
      let page: number | null = 1;
      let guard = 0;
      while (page !== null && guard < 200) {
        guard++;
        const { data, error } = await supabase.functions.invoke("binance-assets", {
          body: {
            action: "verifyOrderOwnership",
            accountId: credentialKey,
            startTimestamp,
            endTimestamp,
            page,
            maxPages: 10,
            dryRun,
          },
        });
        if (error) throw error;
        agg.ordersFetchedFromBinance += data.ordersFetchedFromBinance || 0;
        agg.alreadyCorrect += data.alreadyCorrect || 0;
        agg.reassignedFromOther += data.reassignedFromOther || 0;
        agg.updated += data.updated || 0;
        agg.notInDb += data.notInDb || 0;
        agg.pagesScanned += data.pagesFetched || 0;
        page = data.nextPage ?? null;
      }
      setResults((r) => ({ ...r, [accountId]: agg }));
      toast({
        title: dryRun ? "Dry-run complete" : "Re-stamp complete",
        description: dryRun
          ? `${agg.reassignedFromOther} order(s) would be reassigned to this account.`
          : `${agg.updated} order(s) re-stamped to this account.`,
      });
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Card className="border border-dashed border-muted-foreground/20 bg-muted/20">
      <CardHeader className="py-2 px-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Order Ownership Verification (API)</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Verify each historical P2P order against the live Binance API per account, then re-stamp
          the true owning account. Always dry-run first.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-2 px-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <Alert className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Re-stamping changes the account stamped on orders. Wallet balance reconciliation is a
            separate, reviewed step that runs after ownership is verified.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          {accounts.map((acc: any) => {
            const res = results[acc.id];
            const busyDry = runningId === acc.id + ":dry";
            const busyCommit = runningId === acc.id + ":commit";
            return (
              <div key={acc.id} className="rounded border border-border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: acc.color || "#888" }}
                    />
                    {acc.account_name}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!runningId}
                      onClick={() => runVerification(acc.id, acc.credential_key, true)}
                    >
                      {busyDry ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Dry-run"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!runningId}
                      onClick={() => runVerification(acc.id, acc.credential_key, false)}
                    >
                      {busyCommit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-stamp"}
                    </Button>
                  </div>
                </div>
                {res && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <Badge variant="secondary">Binance orders: {res.ordersFetchedFromBinance}</Badge>
                    <Badge variant="secondary">Already correct: {res.alreadyCorrect}</Badge>
                    <Badge variant={res.reassignedFromOther ? "destructive" : "secondary"}>
                      Reassign: {res.reassignedFromOther}
                    </Badge>
                    <Badge variant="secondary">Re-stamped: {res.updated}</Badge>
                    <Badge variant="outline">Not in DB: {res.notInDb}</Badge>
                    <Badge variant="outline">Pages: {res.pagesScanned}</Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
