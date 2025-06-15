
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Calendar, Tag } from "lucide-react";

export function ClientOverviewPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Client Overview Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Client Name</label>
            <p className="text-lg font-semibold">John Doe</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client ID</label>
            <p className="text-lg font-semibold text-blue-600">CLT-48291</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Date of Onboarding</label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>12 March 2023</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client Age</label>
            <p className="text-sm text-green-600 font-medium">1 year 3 months</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Risk Appetite</label>
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              Medium
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Client Type</label>
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              Retail
            </Badge>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Assigned Operator</label>
          <p className="text-sm font-medium">Ravi Sharma</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline">
            <Tag className="h-4 w-4 mr-1" />
            Edit Details
          </Button>
          <Button size="sm" variant="outline">
            View Full Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
