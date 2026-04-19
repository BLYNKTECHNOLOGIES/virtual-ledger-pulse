import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { useClientBeneficiaries } from "@/hooks/useClientBeneficiaries";

interface ClientBeneficiaryDetailsProps {
  clientId: string | undefined;
  clientName?: string | null;
}

function formatOrder(ord: string | null | undefined): string {
  const v = (ord || "").trim();
  return v || "—";
}

export function ClientBeneficiaryDetails({ clientId, clientName }: ClientBeneficiaryDetailsProps) {
  const { data: beneficiaries, isLoading } = useClientBeneficiaries(clientId, clientName);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Beneficiary Bank Details
          {beneficiaries && beneficiaries.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {beneficiaries.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !beneficiaries || beneficiaries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No beneficiary bank details captured yet. They will appear automatically
            once a completed sell order from this client is synced.
          </p>
        ) : (
          <div className="space-y-3">
            {beneficiaries.map((b) => (
              <div
                key={b.id}
                className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-foreground">
                    {b.account_holder_name || "Unnamed Account"}
                  </div>
                  {b.account_type && (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {b.account_type}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span className="font-mono">{maskAccount(b.account_number)}</span>
                  {b.bank_name && <span>· {b.bank_name}</span>}
                </div>
                {(b.ifsc_code || b.account_opening_branch) && (
                  <div className="text-xs text-muted-foreground">
                    {b.ifsc_code && <span className="font-mono">{b.ifsc_code}</span>}
                    {b.ifsc_code && b.account_opening_branch && " · "}
                    {b.account_opening_branch}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  Captured from order{" "}
                  <span className="font-mono">{maskOrder(b.source_order_number)}</span>
                  {" · "}last seen {format(new Date(b.last_seen_at), "dd MMM yyyy")}
                  {b.occurrence_count > 1 && ` · seen ${b.occurrence_count}×`}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
