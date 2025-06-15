
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Star } from "lucide-react";

export function ClientValueScore() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-purple-600" />
          Client Value Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Monthly Purchase Value</label>
          <p className="text-2xl font-bold text-green-600">₹2,00,000</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Client Value (3%)</label>
          <p className="text-xl font-semibold text-purple-600">₹6,000</p>
          <p className="text-sm text-gray-500">Indicates priority level</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600">Client Priority Tag</label>
          <Badge className="bg-yellow-500 text-white flex items-center gap-1">
            <Star className="h-3 w-3" />
            Platinum
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
