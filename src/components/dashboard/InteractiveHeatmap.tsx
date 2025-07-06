
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface HeatmapData {
  label: string;
  value: number;
  color: string;
  trend: number;
  change: string;
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
      
      // Calculate trend and change percentage
      const baseValue = values[metric as keyof typeof values];
      const trend = Math.random() > 0.5 ? 1 : -1;
      const changePercent = Math.round((Math.random() * 20 + 5) * trend);
      
      return {
        label: key,
        value,
        color: `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`,
        trend,
        change: `${changePercent > 0 ? '+' : ''}${changePercent}%`
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
            Performance Analytics
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
        {/* Interactive Data Visualization */}
        <div className="mb-8">
          <div className="relative h-32 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 overflow-hidden">
            {/* Animated background lines */}
            <div className="absolute inset-0 opacity-20">
              <svg className="w-full h-full" viewBox="0 0 400 100">
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                    <stop offset="50%" stopColor="#6366F1" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                
                {/* Interactive trend lines */}
                <path 
                  d={`M 0 ${60 + Math.sin(0) * 20} ${heatmapData.map((_, i) => 
                    `L ${(i + 1) * (400 / heatmapData.length)} ${60 + Math.sin(i * 0.5) * 15}`
                  ).join(' ')}`}
                  stroke="url(#lineGradient)" 
                  strokeWidth="3" 
                  fill="none"
                  className="animate-pulse"
                />
                
                {/* Data points */}
                {heatmapData.map((item, index) => (
                  <circle
                    key={index}
                    cx={(index + 1) * (400 / heatmapData.length)}
                    cy={80 - (item.value / maxValue) * 40}
                    r="4"
                    fill="#6366F1"
                    className="animate-bounce"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  />
                ))}
              </svg>
            </div>
            
            {/* Overlay stats */}
            <div className="relative z-10 flex items-center justify-between h-full">
              <div className="text-indigo-800">
                <div className="text-2xl font-bold">
                  {selectedMetric === "sales" || selectedMetric === "revenue" 
                    ? `₹${Math.round(heatmapData.reduce((sum, item) => sum + item.value, 0) / heatmapData.length).toLocaleString()}` 
                    : Math.round(heatmapData.reduce((sum, item) => sum + item.value, 0) / heatmapData.length)}
                </div>
                <div className="text-sm opacity-75">Average {selectedMetric}</div>
              </div>
              <div className="flex items-center gap-2 text-indigo-700">
                <Activity className="h-5 w-5" />
                <span className="text-sm font-medium">Live Data</span>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Heatmap Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {heatmapData.map((item, index) => (
            <div
              key={item.label}
              className="relative p-6 rounded-xl border-2 border-gray-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer group overflow-hidden"
              style={{ backgroundColor: item.color }}
            >
              {/* Animated background pattern */}
              <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white to-transparent"></div>
                <div className="absolute bottom-0 right-0 w-1 h-full bg-gradient-to-t from-transparent via-white to-transparent"></div>
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{item.label}</h3>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    item.trend > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {item.trend > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {item.change}
                  </div>
                </div>
                
                <div className="text-3xl font-bold text-gray-900 mb-3">
                  {selectedMetric === "sales" || selectedMetric === "revenue" 
                    ? `₹${item.value.toLocaleString()}` 
                    : item.value.toLocaleString()}
                </div>
                
                {/* Interactive progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-700 mb-1">
                    <span>Performance</span>
                    <span>{((item.value / maxValue) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-1000 ease-out"
                      style={{ 
                        width: `${(item.value / maxValue) * 100}%`,
                        animationDelay: `${index * 0.2}s`
                      }}
                    ></div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-700 flex items-center justify-between">
                  <span>Peak comparison</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-xs">Active</span>
                  </div>
                </div>
              </div>
              
              {/* Visual intensity indicator with animation */}
              <div className="absolute top-3 right-3">
                <div 
                  className="w-6 h-6 rounded-full border-2 border-white shadow-md animate-pulse"
                  style={{ 
                    backgroundColor: item.color, 
                    opacity: 0.8,
                    boxShadow: `0 0 10px ${item.color}50`
                  }}
                />
              </div>
              
              {/* Hover effect overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
