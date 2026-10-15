import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { AssetOverview } from "@/components/terminal/assets/AssetOverview";
import { SpotTradingPanel } from "@/components/terminal/assets/SpotTradingPanel";
import { TradeHistory } from "@/components/terminal/assets/TradeHistory";
import { AssetMovementHistory } from "@/components/terminal/assets/AssetMovementHistory";
import { PanelState, SEG_LIST, SEG_TRIGGER } from "@/components/terminal/assets/assetUi";
import { Wallet, ArrowLeftRight, History, ScrollText, Lock } from "lucide-react";
import { useTerminalAuth } from "@/hooks/useTerminalAuth";
import { useTerminalUserPrefs } from "@/hooks/useTerminalUserPrefs";

export default function TerminalAssets() {
  const { hasPermission, isTerminalAdmin, userId } = useTerminalAuth();
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'assets', { activeTab: 'overview' as string });
  const activeTab = prefs.activeTab;
  const setActiveTab = (v: string) => setPref('activeTab', v);
  const canManageAssets = isTerminalAdmin || hasPermission("terminal_assets_manage");

  return (
    <TerminalPermissionGate permissions={['terminal_assets_view']}>
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      {/* Command strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 shrink-0">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-foreground">Assets</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Binance balances, spot trades and wallet movements</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="-mx-3 -my-1 overflow-x-auto px-3 py-1 sm:-mx-1 sm:px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className={`${SEG_LIST} w-max justify-start`}>
            <TabsTrigger value="overview" className={SEG_TRIGGER}>
              <Wallet className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="spot"
              className={`${SEG_TRIGGER} disabled:opacity-60`}
              disabled={!canManageAssets}
            >
              {canManageAssets ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              Spot Trading
              {!canManageAssets && <span className="sr-only">(locked)</span>}
            </TabsTrigger>
            <TabsTrigger value="history" className={SEG_TRIGGER}>
              <History className="h-3.5 w-3.5" />
              Trade History
            </TabsTrigger>
            <TabsTrigger value="overall" className={SEG_TRIGGER}>
              <ScrollText className="h-3.5 w-3.5" />
              Overall
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0">
          <AssetOverview />
        </TabsContent>

        <TabsContent value="spot" className="mt-0">
          {canManageAssets ? (
            <SpotTradingPanel />
          ) : (
            <div className="t-panel">
              <PanelState
                icon={<Lock className="h-5 w-5" />}
                title="Spot trading is locked"
                hint={<>You need the "Manage Assets (Spot Trade)" permission to access this section.</>}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <TradeHistory />
        </TabsContent>

        <TabsContent value="overall" className="mt-0">
          <AssetMovementHistory />
        </TabsContent>
      </Tabs>
    </div>
    </TerminalPermissionGate>
  );
}
