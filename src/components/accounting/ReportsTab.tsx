
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Download } from "lucide-react";

export function ReportsTab() {
  const reports = [
    { name: "Trial Balance", description: "Summary of all ledger account balances" },
    { name: "Profit & Loss Statement", description: "Income and expenses for the period" },
    { name: "Balance Sheet", description: "Assets, liabilities, and equity" },
    { name: "Cash Flow Statement", description: "Cash inflows and outflows" }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="h-5 w-5" />
            Financial Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {reports.map((report, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{report.name}</h3>
                  <p className="text-sm text-gray-600">{report.description}</p>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Generate
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
