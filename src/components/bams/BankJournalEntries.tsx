
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpensesIncomesTab } from "./journal/ExpensesIncomesTab";
import { ContraEntriesTab } from "./journal/ContraEntriesTab";
import { BookOpen, TrendingUp, ArrowRightLeft } from "lucide-react";

export function BankJournalEntries() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bank Journal Entries</h2>
          <p className="text-gray-600">Manage expenses, incomes, and fund transfers</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="expenses-incomes" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expenses-incomes" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Expenses & Incomes
              </TabsTrigger>
              <TabsTrigger value="contra-entries" className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Contra Entries
              </TabsTrigger>
            </TabsList>

            <TabsContent value="expenses-incomes">
              <ExpensesIncomesTab />
            </TabsContent>

            <TabsContent value="contra-entries">
              <ContraEntriesTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
