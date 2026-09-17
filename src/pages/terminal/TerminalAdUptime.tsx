import { Radio } from 'lucide-react';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { AdUptimePanel } from '@/components/terminal/mpi/AdUptimePanel';

export default function TerminalAdUptime() {
  return (
    <TerminalPermissionGate permissions={['terminal_ad_uptime_view']}>
      <div className="p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">Ad Active Time by Shift</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Binance-derived public ad uptime per shift, category and account (IST)
            </p>
          </div>
        </div>

        <AdUptimePanel />
      </div>
    </TerminalPermissionGate>
  );
}
