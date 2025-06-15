
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Shield, TrendingUp } from "lucide-react";

export function MonthlyLimitsPanel() {
  const usedPercentage = (85000 / 100000) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-green-600" />
          Monthly Limits & Cosmos Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">First Order Value</label>
            <p className="text-lg font-semibold text-green-600">₹50,000</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Current Monthly Limit</label>
            <p className="text-lg font-semibold">₹1,00,000</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-600">Monthly Usage</label>
            <span className="text-sm font-medium">{usedPercentage}% Used</span>
          </div>
          <Progress value={usedPercentage} className="h-2" />
          <div className="flex justify-between text-sm text-gray-500 mt-1">
            <span>Used: ₹85,000</span>
            <span>Remaining: ₹15,000</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Cosmos Triggered?</label>
            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
              ❌ Not Triggered
            </Badge>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Re-KYC Status</label>
            <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
              Pending
            </Badge>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Limit Upgrade Request</label>
          <p className="text-sm">Raised on 12 June by Ravi</p>
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 mt-1">
            In Review
          </Badge>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline">
            <TrendingUp className="h-4 w-4 mr-1" />
            Request Limit Increase
          </Button>
          <Button size="sm" variant="outline">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Cosmos Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
