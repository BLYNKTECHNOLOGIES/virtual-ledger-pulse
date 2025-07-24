
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale, Receipt, Shield } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";
import { TaxationComplianceTab } from "@/components/compliance/TaxationComplianceTab";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Compliance() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 text-white rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-purple-700 rounded-xl shadow-lg">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Compliance Management
                  </h1>
                  <p className="text-purple-200 text-lg">
                    Legal, regulatory, and compliance monitoring
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
