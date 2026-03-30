import AdManager from '@/pages/AdManager';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';

export default function TerminalAdManager() {
  return (
    <TerminalPermissionGate permissions={['terminal_ads_view']}>
      <AdManager />
    </TerminalPermissionGate>
  );
}
