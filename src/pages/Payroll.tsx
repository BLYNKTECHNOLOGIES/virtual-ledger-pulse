
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, FileText } from "lucide-react";
import { SalaryPayoutTab } from "@/components/payroll/SalaryPayoutTab";
import { CompliancePayrollTab } from "@/components/payroll/CompliancePayrollTab";

export default function Payroll() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Payroll Management System</h1>
        <p className="text-gray-600 mt-2">Employee compensation and compliance management</p>
      </div>

      <Tabs defaultValue="salary" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="salary" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Salary Payout
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salary">
          <SalaryPayoutTab />
        </TabsContent>

        <TabsContent value="compliance">
          <CompliancePayrollTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
