
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Scale } from "lucide-react";
import { BankingComplianceTab } from "@/components/compliance/BankingComplianceTab";
import { LegalComplianceTab } from "@/components/compliance/LegalComplianceTab";

export default function Compliance() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Compliance Management</h1>
        <p className="text-gray-600 mt-2">Banking and legal compliance tracking</p>
      </div>

      <Tabs defaultValue="banking" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="banking" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Banking Compliance
          </TabsTrigger>
          <TabsTrigger value="legal" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Legal Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="banking">
          <BankingComplianceTab />
        </TabsContent>

        <TabsContent value="legal">
          <LegalComplianceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
