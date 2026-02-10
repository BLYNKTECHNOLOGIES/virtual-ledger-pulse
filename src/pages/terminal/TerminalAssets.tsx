import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetOverview } from "@/components/terminal/assets/AssetOverview";
import { SpotTradingPanel } from "@/components/terminal/assets/SpotTradingPanel";
import { TradeHistory } from "@/components/terminal/assets/TradeHistory";
import { Wallet, ArrowLeftRight, History } from "lucide-react";

export default function TerminalAssets() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">Assets</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border border-border h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Wallet className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="spot" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Spot Trading
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <History className="h-3.5 w-3.5" />
            Trade History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <AssetOverview />
        </TabsContent>

        <TabsContent value="spot" className="mt-0">
          <SpotTradingPanel />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <TradeHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
