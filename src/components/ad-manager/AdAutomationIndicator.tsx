import { useMemo } from 'react';
import { Bot } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAutoPricingRules, AutoPricingRule } from '@/hooks/useAutoPricingRules';

export interface AdAutomationInfo {
  rules: AutoPricingRule[];
  running: boolean;
}

/** Map every ad number to the auto-pricing rules that target it. */
export function useAdAutomationMap(): Map<string, AdAutomationInfo> {
  const { data: rules } = useAutoPricingRules();
  return useMemo(() => {
    const map = new Map<string, AdAutomationInfo>();
    (rules || []).forEach((rule) => {
      const adNos = new Set<string>([
        ...(rule.ad_numbers || []),
        ...Object.values(rule.asset_config || {}).flatMap((c: any) => c?.ad_numbers || []),
      ]);
      const intervalMs = Math.max((rule.check_interval_seconds || 120) * 3, 600) * 1000;
      const fresh = rule.last_checked_at
        ? Date.now() - new Date(rule.last_checked_at).getTime() < intervalMs
        : false;
      adNos.forEach((advNo) => {
        if (!advNo) return;
        const entry = map.get(advNo) || { rules: [], running: false };
        entry.rules.push(rule);
        entry.running = entry.running || (rule.is_active && fresh);
        map.set(advNo, entry);
      });
    });
    return map;
  }, [rules]);
}

function ago(iso: string | null) {
  if (!iso) return 'never run';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function AdAutomationIndicator({ info, labelClassName }: { info?: AdAutomationInfo; labelClassName?: string }) {
  if (!info || info.rules.length === 0) return null;
  const active = info.rules.filter((r) => r.is_active);
  const tone = info.running
    ? 'border-trade-buy/30 bg-trade-buy/10 text-trade-buy'
    : active.length > 0
      ? 'border-warning/30 bg-warning/10 text-warning'
      : 'border-border bg-secondary/70 text-muted-foreground';
  const word = info.running ? 'Auto' : active.length > 0 ? 'Auto stale' : 'Auto paused';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={`inline-flex h-5 shrink-0 cursor-default items-center gap-1 whitespace-nowrap rounded border px-1.5 text-[10px] font-semibold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
            aria-label={`Automation attached: ${word}`}
          >
            <Bot className={`h-3 w-3 ${info.running ? 'animate-pulse' : ''}`} />
            <span className={labelClassName}>{word}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px]">
          <div className="space-y-1 text-xs">
            <p className="font-medium">
              {info.running ? 'Automation running' : active.length ? 'Automation active (stale)' : 'Automation paused'}
            </p>
            {info.rules.map((r) => (
              <div key={r.id}>
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground"> · {r.is_active ? 'ON' : 'OFF'} · last run {ago(r.last_checked_at)}</span>
                <div className="font-mono text-[10px] text-muted-foreground">ID {r.id.slice(0, 8)}</div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
