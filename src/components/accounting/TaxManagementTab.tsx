
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator } from "lucide-react";

export function TaxManagementTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Tax Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Calculator className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No tax configurations set up</p>
        </div>
      </CardContent>
    </Card>
  );
}
