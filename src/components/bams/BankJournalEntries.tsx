
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExpensesIncomesTab } from "./journal/ExpensesIncomesTab";
import { ContraEntriesTab } from "./journal/ContraEntriesTab";
import { DirectoryTab } from "./journal/DirectoryTab";
import { BookOpen, TrendingUp, ArrowRightLeft, List, PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function BankJournalEntries() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Bank Journal Entries</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSidebar}
          className="flex items-center gap-2"
        >
          <PanelLeftOpen className="h-4 w-4" />
          Toggle Sidebar
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <Tabs defaultValue="expenses-incomes" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="expenses-incomes" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Expenses & Incomes
              </TabsTrigger>
              <TabsTrigger value="contra-entries" className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Contra Entries
              </TabsTrigger>
              <TabsTrigger value="directory" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                Directory
              </TabsTrigger>
            </TabsList>

            <TabsContent value="expenses-incomes">
              <ExpensesIncomesTab />
            </TabsContent>

            <TabsContent value="contra-entries">
              <ContraEntriesTab />
            </TabsContent>

            <TabsContent value="directory">
              <DirectoryTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
