
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, TrendingUp, AlertTriangle, Activity } from "lucide-react";

interface TradingPatternAnalysisProps {
  clientId?: string;
}

export function TradingPatternAnalysis({ clientId }: TradingPatternAnalysisProps) {
  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          Trading Pattern Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-blue-100">
            <div className="text-3xl font-bold text-blue-600">67</div>
            <div className="text-sm text-gray-600 mt-1">Total Past Orders</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-green-100">
            <div className="text-3xl font-bold text-green-600">6.1</div>
            <div className="text-sm text-gray-600 mt-1">Avg Orders/Month</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-purple-100">
            <div className="text-3xl font-bold text-purple-600">₹33,000</div>
            <div className="text-sm text-gray-600 mt-1">Average Order Amount</div>
          </div>
          
          <div className="text-center p-4 bg-white rounded-lg shadow-sm border border-green-100">
            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 px-3 py-1">
              Stable Pattern
            </Badge>
            <div className="text-sm text-gray-600 mt-2">Order Frequency</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="p-4 bg-white rounded-lg border border-red-100">
            <label className="text-sm font-medium text-gray-700">Cosmos Alert (Pattern Change)</label>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 px-3 py-1">
                ❌ No Alert
              </Badge>
            </div>
          </div>
          
          <div className="p-4 bg-white rounded-lg border border-green-100">
            <label className="text-sm font-medium text-gray-700">250% Spike Detected?</label>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 px-3 py-1">
                No
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-6 border-t border-gray-200 mt-6">
          <Button size="sm" variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50">
            <TrendingUp className="h-4 w-4 mr-2" />
            View Charts
          </Button>
          <Button size="sm" variant="outline" className="border-purple-300 text-purple-600 hover:bg-purple-50">
            <Activity className="h-4 w-4 mr-2" />
            Pattern Settings
          </Button>
          <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Alert Rules
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
