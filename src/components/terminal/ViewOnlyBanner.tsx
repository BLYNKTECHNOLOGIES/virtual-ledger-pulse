import { Eye } from 'lucide-react';
import { useTerminalDeviceMode } from '@/contexts/TerminalDeviceModeContext';

/** Persistent strip shown while the terminal runs on a personal device. */
export function ViewOnlyBanner() {
  const { isViewOnly, reason } = useTerminalDeviceMode();
  if (!isViewOnly) return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-medium text-warning">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="uppercase tracking-[0.14em]">View only — personal device</span>
      <span className="hidden text-warning/80 sm:inline">
        · You can watch everything your role covers, but actions are disabled
        {reason ? ` (${reason})` : ''}
      </span>
    </div>
  );
}
