import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gavel, ShieldAlert, CalendarClock } from "lucide-react";
import { RegulatoryCasesTab } from "./RegulatoryCasesTab";
import { StrRegisterTab } from "./StrRegisterTab";
import { StatutoryCalendarTab } from "./StatutoryCalendarTab";
import { complianceTabsListCls, complianceTabTriggerCls, complianceTabsWrapperCls } from "./complianceTabStyles";

export function RegulatoryComplianceTab() {
  return (
    <Tabs defaultValue="cases" className="space-y-6">
      <div className={complianceTabsWrapperCls}>
        <TabsList className={complianceTabsListCls}>
          <TabsTrigger value="cases" className={complianceTabTriggerCls}>
            <Gavel className="h-4 w-4" />
            <span className="hidden sm:inline">NCRP / Cyber Cell</span>
            <span className="sm:hidden">NCRP</span>
          </TabsTrigger>
          <TabsTrigger value="str" className={complianceTabTriggerCls}>
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">STR Register</span>
            <span className="sm:hidden">STR</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className={complianceTabTriggerCls}>
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Statutory Calendar</span>
            <span className="sm:hidden">Calendar</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="cases"><RegulatoryCasesTab /></TabsContent>
      <TabsContent value="str"><StrRegisterTab /></TabsContent>
      <TabsContent value="calendar"><StatutoryCalendarTab /></TabsContent>
    </Tabs>
  );
}
