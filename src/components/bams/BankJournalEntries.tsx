
import { useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const ExpensesIncomesTab = lazy(() => import("./journal/ExpensesIncomesTab").then(m => ({ default: m.ExpensesIncomesTab })));
const ContraEntriesTab = lazy(() => import("./journal/ContraEntriesTab").then(m => ({ default: m.ContraEntriesTab })));
const DirectoryTab = lazy(() => import("./journal/DirectoryTab").then(m => ({ default: m.DirectoryTab })));
import { BookOpen, TrendingUp, ArrowRightLeft, List } from "lucide-react";

export function BankJournalEntries() {
  const [searchParams] = useSearchParams();
  const initialSubTab = searchParams.get("journalView") === "opex" ? "directory" : "expenses-incomes";
  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-info" />
          <h2 className="text-2xl font-semibold text-foreground">Bank Journal Entries</h2>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <Tabs defaultValue={initialSubTab} className="space-y-6">
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
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}><ExpensesIncomesTab /></Suspense>
            </TabsContent>

            <TabsContent value="contra-entries">
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}><ContraEntriesTab /></Suspense>
            </TabsContent>

            <TabsContent value="directory">
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}><DirectoryTab /></Suspense>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
