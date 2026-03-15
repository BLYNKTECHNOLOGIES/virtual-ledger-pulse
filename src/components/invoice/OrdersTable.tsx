import type { OrderRecord, InvoiceCategory } from "@/types/invoice";

interface OrdersTableProps {
  records: OrderRecord[];
  category?: InvoiceCategory;
}

export default function OrdersTable({ records, category = "it_services" }: OrdersTableProps) {
  const isFinancial = category === "financial_intermediation";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Invoice No.</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">SAC</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Qty</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Unit</th>
              {isFinancial && (
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Txn Value</th>
              )}
              {isFinancial && (
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">UTR</th>
              )}
              {isFinancial && (
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Margin %</th>
              )}
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {isFinancial ? "Service Margin" : "Rate"}
              </th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {isFinancial ? "Taxable Value" : "Amount"}
              </th>
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
                <td className="px-4 py-3 text-right font-mono">{r.quantity}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.unit || "NOS"}</td>
                {isFinancial && (
                  <td className="px-4 py-3 text-right font-mono">₹{(r.transactionValue || 0).toLocaleString()}</td>
                )}
                {isFinancial && (
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{r.utrReference || "-"}</td>
                )}
                {isFinancial && (
                  <td className="px-4 py-3 text-right font-mono">
                    {r.marginType === "percentage" && r.marginPercentage ? `${r.marginPercentage}%` : "-"}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-mono">
                  ₹{isFinancial ? (r.serviceMargin || 0).toFixed(2) : r.rate.toFixed(2)}
                </td>
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
