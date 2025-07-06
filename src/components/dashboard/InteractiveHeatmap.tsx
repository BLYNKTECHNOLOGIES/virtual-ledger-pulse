
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";

interface HeatmapData {
  label: string;
  value: number;
  color: string;
}

interface InteractiveHeatmapProps {
  selectedPeriod: string;
}

export function InteractiveHeatmap({ selectedPeriod }: InteractiveHeatmapProps) {
  const [selectedMetric, setSelectedMetric] = useState("sales");

  // Mock data - in real app, this would come from your analytics
  const generateHeatmapData = (metric: string, period: string): HeatmapData[] => {
    const baseData = {
      "All Time Avg": { sales: 125000, revenue: 2500000, orders: 45 },
      "Yesterday": { sales: 98000, revenue: 1960000, orders: 38 },
      "Same Day Last Month": { sales: 110000, revenue: 2200000, orders: 42 }
    };

    const periodMultiplier = period === "24h" ? 0.8 : period === "7d" ? 1.2 : period === "30d" ? 1.5 : 1;

    return Object.entries(baseData).map(([key, values], index) => {
      const value = Math.round(values[metric as keyof typeof values] * periodMultiplier);
      const intensity = value / Math.max(...Object.values(baseData).map(v => v[metric as keyof typeof v]));
      
      return {
        label: key,
        value,
        color: `rgba(59, 130, 246, ${0.3 + intensity * 0.7})` // Blue with varying opacity
      };
    });
  };

  const heatmapData = generateHeatmapData(selectedMetric, selectedPeriod);
  const maxValue = Math.max(...heatmapData.map(d => d.value));

  return (
    <Card className="bg-white border-2 border-gray-200 shadow-xl">
      <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-indigo-700 rounded-lg shadow-md">
              <BarChart3 className="h-6 w-6" />
            </div>
            Performance Analytics Heatmap
          </CardTitle>
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-40 bg-white text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales Amount</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="orders">Orders Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {heatmapData.map((item, index) => (
            <div
              key={item.label}
              className="relative p-6 rounded-xl border-2 border-gray-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer"
              style={{ backgroundColor: item.color }}
            >
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.label}</h3>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  {selectedMetric === "sales" || selectedMetric === "revenue" 
                    ? `₹${item.value.toLocaleString()}` 
                    : item.value.toLocaleString()}
                </div>
                <div className="text-sm text-gray-700">
                  {((item.value / maxValue) * 100).toFixed(1)}% of peak
                </div>
              </div>
              
              {/* Visual intensity indicator */}
              <div className="absolute top-2 right-2">
                <div 
                  className="w-4 h-4 rounded-full border-2 border-white shadow-md"
                  style={{ backgroundColor: item.color, opacity: 0.8 }}
                />
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Comparing performance metrics across different time periods</p>
          <p className="text-xs mt-1">Data filtered for: <span className="font-semibold">{selectedPeriod}</span></p>
        </div>
      </CardContent>
    </Card>
  );
}
