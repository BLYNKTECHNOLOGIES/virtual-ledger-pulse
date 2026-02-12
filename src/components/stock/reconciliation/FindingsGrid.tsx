import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, X, Flag, ChevronRight, AlertCircle, AlertTriangle, Info, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  findings: any[];
  isLoading: boolean;
  onFeedback: (id: string, status: string, note?: string) => void;
  onSelect: (finding: any) => void;
}

const SEVERITY_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
  warning: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
  review: { icon: Eye, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-100' },
};

const ACTION_LABELS: Record<string, string> = {
  create_purchase: 'Create Purchase',
  create_sales: 'Create Sales',
  include_small_sales: 'Add to Small Sales',
  record_deposit: 'Record Deposit',
  record_withdrawal: 'Record Withdrawal',
  adjust_fee: 'Adjust Fee',
  adjust_amount: 'Adjust Amount',
  merge_clients: 'Merge Clients',
  reverse_duplicate: 'Reverse Duplicate',
  record_conversion: 'Record Conversion',
  review_conversion: 'Review Conversion',
  wallet_adjustment: 'Wallet Adjustment',
  map_payment_method: 'Map Method',
  review_pending: 'Review Pending',
};

const TYPE_LABELS: Record<string, string> = {
  missing_purchase: 'Missing Purchase',
  missing_sale: 'Missing Sale',
  missing_small_sale: 'Missing Small Sale',
  duplicate_entry: 'Duplicate Entry',
  amount_mismatch: 'Amount Mismatch',
  fee_variance: 'Fee Variance',
  wallet_balance_gap: 'Wallet Gap',
  unrecorded_deposit: 'Unrecorded Deposit',
  unrecorded_withdrawal: 'Unrecorded Withdrawal',
  unmapped_client: 'Unmapped Client',
  conversion_gap: 'Conversion Gap',
  small_sales_gap: 'Small Sales Gap',
  payment_method_drift: 'Payment Drift',
  stale_pending: 'Stale Pending',
};

export function FindingsGrid({ findings, isLoading, onFeedback, onSelect }: Props) {
  if (isLoading) {
    return (
      <Card className="p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 mb-2" />
        ))}
      </Card>
    );
  }

  if (findings.length === 0) {
    return (
      <Card className="p-12 text-center">
        <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-foreground">No Findings</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Run a scan or adjust filters to see reconciliation findings.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[32px]" />
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Asset</TableHead>
              <TableHead className="text-xs">Terminal Ref</TableHead>
              <TableHead className="text-xs">ERP Ref</TableHead>
              <TableHead className="text-xs text-right">Terminal ₹</TableHead>
              <TableHead className="text-xs text-right">ERP ₹</TableHead>
              <TableHead className="text-xs text-right">Variance</TableHead>
              <TableHead className="text-xs">Confidence</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs w-[140px]">Feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((f) => {
              const sevConfig = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
              const SevIcon = sevConfig.icon;

              return (
                <TableRow
                  key={f.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => onSelect(f)}
                >
                  <TableCell>
                    <div className={`p-1 rounded ${sevConfig.bg}`}>
                      <SevIcon className={`h-3.5 w-3.5 ${sevConfig.color}`} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium whitespace-nowrap">
                      {TYPE_LABELS[f.finding_type] || f.finding_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono">
                      {f.asset || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                    {f.terminal_ref || '-'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                    {f.erp_ref || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {f.terminal_amount != null ? `₹${Number(f.terminal_amount).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {f.erp_amount != null ? `₹${Number(f.erp_amount).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {f.variance != null ? (
                      <span className={Number(f.variance) > 0 ? 'text-red-600 font-semibold' : ''}>
                        ₹{Number(f.variance).toLocaleString()}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            f.confidence >= 0.9 ? 'bg-emerald-500' :
                            f.confidence >= 0.7 ? 'bg-amber-500' : 'bg-red-400'
                          }`}
                          style={{ width: `${(f.confidence || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round((f.confidence || 0) * 100)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">
                      {ACTION_LABELS[f.suggested_action] || f.suggested_action}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {f.status === 'open' ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => onFeedback(f.id, 'accepted')}
                          title="Accept"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600 hover:bg-red-50"
                          onClick={() => onFeedback(f.id, 'rejected')}
                          title="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                          onClick={() => onFeedback(f.id, 'false_positive')}
                          title="False Positive"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant={f.status === 'accepted' ? 'default' : 'secondary'}
                        className={`text-xs ${
                          f.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                          f.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {f.status === 'false_positive' ? 'False +' : f.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
