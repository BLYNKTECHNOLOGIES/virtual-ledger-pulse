import { Card } from "@/components/ui/card";
import { Brain, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface Props {
  lastScan: any;
  isLoading: boolean;
  counts?: { openCount: number; total: number; bySeverity: Record<string, number> };
}

export function ReconciliationHealthBanner({ lastScan, isLoading, counts }: Props) {
  if (isLoading) {
    return (
      <Card className="p-4 animate-pulse bg-slate-100">
        <div className="h-12" />
      </Card>
    );
  }

  const criticalCount = counts?.bySeverity?.critical || 0;
  const openCount = counts?.openCount || 0;
  const hasIssues = criticalCount > 0;
  const hasWarnings = openCount > 0 && !hasIssues;

  const bgClass = hasIssues
    ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
    : hasWarnings
    ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200'
    : 'bg-gradient-to-r from-emerald-50 to-cyan-50 border-emerald-200';

  const iconColor = hasIssues ? 'text-red-500' : hasWarnings ? 'text-amber-500' : 'text-emerald-500';
  const Icon = hasIssues ? AlertTriangle : hasWarnings ? TrendingUp : CheckCircle;

  return (
    <Card className={`p-5 border ${bgClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-xl ${hasIssues ? 'bg-red-100' : hasWarnings ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {hasIssues ? 'Critical Issues Detected' : hasWarnings ? 'Issues Pending Review' : 'System Health: Good'}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {lastScan?.ai_summary || 'Run a scan to check for discrepancies between Terminal and ERP.'}
            </p>
          </div>
        </div>
        {lastScan && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Last scan: {new Date(lastScan.started_at).toLocaleString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
