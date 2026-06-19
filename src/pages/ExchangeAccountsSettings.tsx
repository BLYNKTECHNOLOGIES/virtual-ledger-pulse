import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeAccount, type ExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlugZap, CheckCircle2, XCircle, Save } from "lucide-react";

interface TestResult {
  ok: boolean;
  detail: string;
}

export default function ExchangeAccountsSettings() {
  const { accounts, refresh } = useExchangeAccount();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = hasRole("super admin");

  const [drafts, setDrafts] = useState<Record<string, Partial<ExchangeAccount>>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftFor = (acc: ExchangeAccount) => ({ ...acc, ...drafts[acc.id] });

  const updateDraft = (id: string, patch: Partial<ExchangeAccount>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (acc: ExchangeAccount) => {
    const d = draftFor(acc);
    setSavingId(acc.id);
    const { error } = await supabase
      .from("terminal_exchange_accounts")
      .update({
        account_name: d.account_name,
        account_identifier: d.account_identifier,
        color: d.color,
        is_active: d.is_active,
      })
      .eq("id", acc.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `${d.account_name} updated.` });
    setDrafts((s) => {
      const n = { ...s };
      delete n[acc.id];
      return n;
    });
    refresh();
  };

  const testConnection = async (acc: ExchangeAccount) => {
    setTesting(acc.id);
    setResults((r) => ({ ...r, [acc.id]: undefined as unknown as TestResult }));
    try {
      const { data, error } = await supabase.functions.invoke("verify-binance-keys", {
        body: { exchange_account_id: acc.id },
      });
      if (error) throw error;
      const ok = !!data?.api_key_valid && data?.proxy_ping === "OK";
      const detail = ok
        ? `Proxy OK · API valid · ${data?.assets_found ?? 0} assets`
        : data?.error
        ? data.error
        : `proxy:${data?.proxy_ping ?? "?"} · api_valid:${data?.api_key_valid ?? false}`;
      setResults((r) => ({ ...r, [acc.id]: { ok, detail } }));
    } catch (e) {
      setResults((r) => ({ ...r, [acc.id]: { ok: false, detail: (e as Error).message } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Binance Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the Binance IDs connected to your ERP and terminals. Credentials are stored securely as
          backend secrets — only the connection settings are editable here.
        </p>
      </div>

      {accounts.map((acc) => {
        const d = draftFor(acc);
        const dirty = !!drafts[acc.id];
        const res = results[acc.id];
        return (
          <Card key={acc.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-foreground">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color || "#64748B" }} />
                {d.account_name}
                {acc.is_default && <Badge variant="secondary">Primary</Badge>}
                {!acc.is_active && <Badge variant="outline">Inactive</Badge>}
              </CardTitle>
              <code className="text-xs text-muted-foreground">key: {acc.credential_key}</code>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-foreground">Display name</Label>
                  <Input
                    className="text-foreground"
                    value={d.account_name ?? ""}
                    disabled={!isSuperAdmin}
                    onChange={(e) => updateDraft(acc.id, { account_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground">Binance identifier</Label>
                  <Input
                    className="text-foreground"
                    value={d.account_identifier ?? ""}
                    disabled={!isSuperAdmin}
                    onChange={(e) => updateDraft(acc.id, { account_identifier: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground">Tag color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded border"
                      value={d.color || "#64748B"}
                      disabled={!isSuperAdmin}
                      onChange={(e) => updateDraft(acc.id, { color: e.target.value })}
                    />
                    <Input
                      className="text-foreground"
                      value={d.color ?? ""}
                      disabled={!isSuperAdmin}
                      onChange={(e) => updateDraft(acc.id, { color: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!d.is_active}
                    disabled={!isSuperAdmin}
                    onCheckedChange={(v) => updateDraft(acc.id, { is_active: v })}
                  />
                  <span className="text-sm text-foreground">Active</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={testing === acc.id} onClick={() => testConnection(acc)}>
                    {testing === acc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )}
                    Test connection
                  </Button>
                  {isSuperAdmin && (
                    <Button size="sm" disabled={!dirty || savingId === acc.id} onClick={() => save(acc)}>
                      {savingId === acc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  )}
                </div>
              </div>

              {res && (
                <div
                  className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                    res.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {res.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {res.detail}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        To add a new Binance ID: create its API key on Binance with the AWS proxy IP whitelisted, add the
        <code className="mx-1">BINANCE_API_KEY_N</code> / <code className="mx-1">BINANCE_API_SECRET_N</code> secrets,
        then insert a row in the exchange accounts table with the matching credential key.
      </p>
    </div>
  );
}
