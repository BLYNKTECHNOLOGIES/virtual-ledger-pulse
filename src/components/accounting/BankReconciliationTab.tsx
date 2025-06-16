
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Upload } from "lucide-react";

export function BankReconciliationTab() {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Bank Reconciliation
          </CardTitle>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Import Statement
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No bank statements imported</p>
          <Button className="mt-4">Import Bank Statement</Button>
        </div>
      </CardContent>
    </Card>
  );
}
