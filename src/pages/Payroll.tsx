
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, FileText, DollarSign } from "lucide-react";
import { SalaryPayoutTab } from "@/components/payroll/SalaryPayoutTab";
import { CompliancePayrollTab } from "@/components/payroll/CompliancePayrollTab";

export default function Payroll() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-200 via-yellow-200 to-orange-200 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-100 rounded-xl shadow-lg">
                  <DollarSign className="h-8 w-8 text-amber-700" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Payroll Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Employee salary processing and compliance
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
