
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, TrendingUp, AlertTriangle, Activity } from "lucide-react";

export function TradingPatternAnalysis() {
  return (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          Trading Pattern Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">67</div>
            <div className="text-sm text-gray-600">Total Past Orders</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">6.1</div>
            <div className="text-sm text-gray-600">Avg Orders/Month</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">₹33,000</div>
            <div className="text-sm text-gray-600">Average Order Amount</div>
          </div>
          
          <div className="text-center">
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              Stable Pattern
            </Badge>
            <div className="text-sm text-gray-600 mt-1">Order Frequency</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div>
            <label className="text-sm font-medium text-gray-600">Cosmos Alert (Pattern Change)</label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                ❌ No Alert
              </Badge>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-600">250% Spike Detected?</label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                No
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t mt-4">
          <Button size="sm" variant="outline" className="border-blue-200 hover:bg-blue-50">
            <TrendingUp className="h-4 w-4 mr-1" />
            View Charts
          </Button>
          <Button size="sm" variant="outline" className="border-blue-200 hover:bg-blue-50">
            <Activity className="h-4 w-4 mr-1" />
            Pattern Settings
          </Button>
          <Button size="sm" variant="outline" className="border-blue-200 hover:bg-blue-50">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Alert Rules
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
