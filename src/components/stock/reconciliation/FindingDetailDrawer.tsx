import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { CheckCircle, X, Flag, Brain, Clock, ArrowRight } from "lucide-react";

interface Props {
  finding: any;
  open: boolean;
  onClose: () => void;
  onFeedback: (id: string, status: string, note?: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-orange-100 text-orange-700 border-orange-200',
  review: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
};

export function FindingDetailDrawer({ finding, open, onClose, onFeedback }: Props) {
  if (!finding) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Finding Detail
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Header Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={SEVERITY_COLORS[finding.severity]}>
              {finding.severity.toUpperCase()}
            </Badge>
            <Badge variant="outline">{finding.category}</Badge>
            {finding.asset && (
              <Badge variant="secondary" className="font-mono">{finding.asset}</Badge>
            )}
            <Badge variant={finding.status === 'open' ? 'default' : 'secondary'}>
              {finding.status}
            </Badge>
          </div>

          {/* AI Reasoning */}
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Brain className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 mb-1">AI Analysis</p>
                <p className="text-sm text-blue-700 leading-relaxed">
                  {finding.ai_reasoning || 'No AI reasoning available for this finding.'}
                </p>
              </div>
            </div>
          </Card>

          {/* Data Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Terminal Data</p>
              <div className="space-y-2">
                <Row label="Reference" value={finding.terminal_ref || '-'} mono />
                <Row label="Amount" value={finding.terminal_amount != null ? `₹${Number(finding.terminal_amount).toLocaleString()}` : '-'} />
              </div>
            </Card>
            <Card className="p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">ERP Data</p>
              <div className="space-y-2">
                <Row label="Reference" value={finding.erp_ref || '-'} mono />
                <Row label="Amount" value={finding.erp_amount != null ? `₹${Number(finding.erp_amount).toLocaleString()}` : '-'} />
              </div>
            </Card>
          </div>

          {/* Variance */}
          {finding.variance != null && Number(finding.variance) > 0 && (
            <Card className="p-3 bg-red-50 border-red-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700">Variance</span>
                <span className="text-lg font-bold text-red-700">₹{Number(finding.variance).toLocaleString()}</span>
              </div>
            </Card>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  finding.confidence >= 0.9 ? 'bg-emerald-500' :
                  finding.confidence >= 0.7 ? 'bg-amber-500' : 'bg-red-400'
                }`}
                style={{ width: `${(finding.confidence || 0) * 100}%` }}
              />
            </div>
            <span className="text-sm font-mono font-semibold">{Math.round((finding.confidence || 0) * 100)}%</span>
          </div>

          {/* Suggested Action */}
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Suggested Action:</span>
              <Badge variant="secondary">{finding.suggested_action}</Badge>
            </div>
          </Card>

          {/* Extra Details */}
          {finding.details && Object.keys(finding.details).length > 0 && (
            <Card className="p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Additional Details</p>
              <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto max-h-48 text-slate-700">
                {JSON.stringify(finding.details, null, 2)}
              </pre>
            </Card>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Detected: {new Date(finding.created_at).toLocaleString()}</span>
          </div>

          <Separator />

          {/* Action Buttons */}
          {finding.status === 'open' && (
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => { onFeedback(finding.id, 'accepted'); onClose(); }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { onFeedback(finding.id, 'rejected'); onClose(); }}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => { onFeedback(finding.id, 'false_positive'); onClose(); }}
              >
                <Flag className="h-4 w-4 mr-2" />
                False +
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${mono ? 'font-mono' : ''} max-w-[160px] truncate`}>{value}</span>
    </div>
  );
}
