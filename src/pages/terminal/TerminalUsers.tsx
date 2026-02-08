import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalPermissionGate } from "@/components/terminal/TerminalPermissionGate";
import { TerminalUsersList } from "@/components/terminal/users/TerminalUsersList";
import { TerminalRolesList } from "@/components/terminal/users/TerminalRolesList";

export default function TerminalUsers() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <TerminalPermissionGate permissions={["terminal_users_view"]}>
      <div className="space-y-4 p-1">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users & Roles</h1>
          <p className="text-sm text-muted-foreground">Manage terminal access and role permissions</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs">Roles & Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <TerminalUsersList />
          </TabsContent>

          <TabsContent value="roles" className="mt-4">
            <TerminalRolesList />
          </TabsContent>
        </Tabs>
      </div>
    </TerminalPermissionGate>
  );
}
