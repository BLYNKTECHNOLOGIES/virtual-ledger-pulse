
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRightLeft, Check } from "lucide-react";
import { format } from "date-fns";

interface TransferHistoryProps {
  transfers: any[];
}

export function TransferHistory({ transfers }: TransferHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transfers</CardTitle>
      </CardHeader>
      <CardContent>
        {!transfers || transfers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No transfers recorded yet
          </div>
        ) : (
          <div className="space-y-4">
            {transfers
              .filter(transfer => transfer.transaction_type === 'TRANSFER_OUT')
              .map((transfer) => (
              <div
                key={transfer.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {transfer.bank_accounts?.account_name} → {transfer.related_account_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {format(new Date(transfer.transaction_date), "MMM dd, yyyy")}
                    </div>
                    {transfer.description && (
                      <div className="text-sm text-gray-500">{transfer.description}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lg">₹{parseFloat(transfer.amount.toString()).toLocaleString()}</div>
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <Check className="h-3 w-3" />
                    Completed
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
