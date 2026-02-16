import type { OrderRecord } from "@/types/invoice";

interface OrdersTableProps {
  records: OrderRecord[];
}

export default function OrdersTable({ records }: OrdersTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Invoice No.</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">HSN/SAC</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Qty</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Rate</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Buyer</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr
                key={r.invoiceNumber + i}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.invoiceNumber}</td>
                <td className="px-4 py-3 font-medium">{r.description}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.hsnSac}</td>
                <td className="px-4 py-3 text-right font-mono">{r.quantity.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">₹{r.rate.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold font-mono">₹{r.amount.toLocaleString()}</td>
                <td className="px-4 py-3">{r.buyerName}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
