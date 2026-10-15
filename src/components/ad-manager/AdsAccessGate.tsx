// AM-SEC-2 — one rule for /terminal/ads, /ad-manager and both zone-book routes:
// opening needs terminal_ads_view (Terminal rights; Super Admin has every right).
// ERP routes have no TerminalAuthProvider, so one is mounted here.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { TerminalAuthProvider, useTerminalAuth } from '@/hooks/useTerminalAuth';
import { AdsRightsProvider, computeAdsRights } from './adsRights';

function Inner({ children }: { children: ReactNode }) {
  const { hasPermission, isLoading } = useTerminalAuth();
  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  const rights = computeAdsRights((p) => hasPermission(p as never));
  if (!rights.canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Shield className="h-8 w-8 opacity-30" />
        <p className="text-xs">You need the Terminal Ads 'View' right to open this page.</p>
      </div>
    );
  }
  return <AdsRightsProvider rights={rights}>{children}</AdsRightsProvider>;
}

export function AdsAccessGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname.startsWith('/terminal')) return <Inner>{children}</Inner>;
  return (
    <TerminalAuthProvider>
      <Inner>{children}</Inner>
    </TerminalAuthProvider>
  );
}
