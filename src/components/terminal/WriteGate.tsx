import { ReactNode, cloneElement, isValidElement } from 'react';
import { Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useTerminalDeviceMode } from '@/contexts/TerminalDeviceModeContext';

const VIEW_ONLY_HINT = 'Not available on a personal (view-only) device';

interface WriteGateProps {
  children: ReactNode;
  /** Render nothing at all instead of a disabled control. */
  hide?: boolean;
  /** Custom replacement while view-only. */
  fallback?: ReactNode;
}

/**
 * Wraps an action control. On a personal (view-only) device the control is
 * rendered disabled with an explanatory tooltip, so the operator never has to
 * discover the restriction by hitting a server error.
 */
export function WriteGate({ children, hide = false, fallback }: WriteGateProps) {
  const { isViewOnly } = useTerminalDeviceMode();

  if (!isViewOnly) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  if (hide) return null;

  const disabledChild = isValidElement(children)
    ? cloneElement(children as never, { disabled: true } as never)
    : children;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">{disabledChild}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {VIEW_ONLY_HINT}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { VIEW_ONLY_HINT };
