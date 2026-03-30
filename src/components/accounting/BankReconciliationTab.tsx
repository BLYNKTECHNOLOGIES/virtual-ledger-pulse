
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";

export function BankReconciliationTab() {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Bank Reconciliation
          </CardTitle>
          <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Bank reconciliation tools are under development. You'll be able to import and reconcile bank statements here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
