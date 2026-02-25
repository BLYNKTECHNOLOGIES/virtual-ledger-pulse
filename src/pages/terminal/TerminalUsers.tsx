import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalPermissionGate } from "@/components/terminal/TerminalPermissionGate";
import { TerminalUsersList } from "@/components/terminal/users/TerminalUsersList";
import { TerminalRolesList } from "@/components/terminal/users/TerminalRolesList";
import { TerminalHierarchyView } from "@/components/terminal/users/TerminalHierarchyView";
import { TerminalExchangeAccounts } from "@/components/terminal/users/TerminalExchangeAccounts";
import { TerminalSizeRanges } from "@/components/terminal/users/TerminalSizeRanges";
import { PayerAssignmentManager } from "@/components/terminal/payer/PayerAssignmentManager";
import { TerminalOrgChart } from "@/components/terminal/users/TerminalOrgChart";

export default function TerminalUsers() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <TerminalPermissionGate permissions={["terminal_users_view"]}>
      <div className="space-y-4 p-1">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users & Roles</h1>
          <p className="text-sm text-muted-foreground">Manage terminal access, hierarchy, and jurisdiction mappings</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs">Roles</TabsTrigger>
            <TabsTrigger value="hierarchy" className="text-xs">Hierarchy</TabsTrigger>
            <TabsTrigger value="exchanges" className="text-xs">Exchange Accounts</TabsTrigger>
            <TabsTrigger value="ranges" className="text-xs">Size Ranges</TabsTrigger>
            <TabsTrigger value="payer" className="text-xs">Payer Assignments</TabsTrigger>
            <TabsTrigger value="orgchart" className="text-xs">Org Chart</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <TerminalUsersList />
          </TabsContent>

          <TabsContent value="roles" className="mt-4">
            <TerminalRolesList />
          </TabsContent>

          <TabsContent value="hierarchy" className="mt-4">
            <TerminalHierarchyView />
          </TabsContent>

          <TabsContent value="exchanges" className="mt-4">
            <TerminalExchangeAccounts />
          </TabsContent>

          <TabsContent value="ranges" className="mt-4">
            <TerminalSizeRanges />
          </TabsContent>

          <TabsContent value="payer" className="mt-4">
            <PayerAssignmentManager />
          </TabsContent>

          <TabsContent value="orgchart" className="mt-4">
            <TerminalOrgChart />
          </TabsContent>
        </Tabs>
      </div>
    </TerminalPermissionGate>
  );
}
