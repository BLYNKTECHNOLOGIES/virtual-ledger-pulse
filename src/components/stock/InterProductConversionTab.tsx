
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Clock, History, Briefcase, Activity, BarChart3 } from "lucide-react";
import { CreateConversionForm } from "./conversion/CreateConversionForm";
import { PendingConversionsTable } from "./conversion/PendingConversionsTable";
import { ConversionHistoryTable } from "./conversion/ConversionHistoryTable";
import { PortfolioSnapshot } from "./conversion/PortfolioSnapshot";
import { RealizedPnlReport } from "./conversion/RealizedPnlReport";
import { ExecutionVarianceReport } from "./conversion/ExecutionVarianceReport";

export function InterProductConversionTab() {
  const [subTab, setSubTab] = useState("create");

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="create" className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Portfolio
          </TabsTrigger>
          <TabsTrigger value="pnl" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Realized P&L
          </TabsTrigger>
          <TabsTrigger value="variance" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Variance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <CreateConversionForm />
        </TabsContent>
        <TabsContent value="pending">
          <PendingConversionsTable />
        </TabsContent>
        <TabsContent value="history">
          <ConversionHistoryTable />
        </TabsContent>
        <TabsContent value="portfolio">
          <PortfolioSnapshot />
        </TabsContent>
        <TabsContent value="pnl">
          <RealizedPnlReport />
        </TabsContent>
        <TabsContent value="variance">
          <ExecutionVarianceReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
