
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale, Receipt } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";
import { TaxationComplianceTab } from "@/components/compliance/TaxationComplianceTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Compliance() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Compliance</h1>
        <p className="text-gray-600 mt-2">Manage banking, legal, and taxation compliance</p>
      </div>

      <ErrorBoundary>
        <Tabs defaultValue="banking" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="banking" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Banking Compliance
            </TabsTrigger>
            <TabsTrigger value="legal" className="flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Legal Compliance
            </TabsTrigger>
            <TabsTrigger value="taxation" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Taxation Compliance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="banking">
            <ErrorBoundary>
              <BankingComplianceTab />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="legal">
            <ErrorBoundary>
              <LegalComplianceTab />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="taxation">
            <ErrorBoundary>
              <TaxationComplianceTab />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </ErrorBoundary>
    </div>
  );
}
