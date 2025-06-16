
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

export function StockReportsTab() {
  const reports = [
    { name: "Stock Movement Report", description: "Track all stock movements for a period" },
    { name: "Stock Availability Report", description: "View current stock levels and availability" },
    { name: "Stock Aging Report", description: "Identify slow-moving inventory" },
    { name: "Reorder Report", description: "Products below reorder level" }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Stock Reports
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
