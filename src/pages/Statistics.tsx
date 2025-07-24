
import { BarChart3 } from "lucide-react";
import { StatisticsTab } from "@/components/hrms/StatisticsTab";

export default function Statistics() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-slate-50 rounded-xl shadow-sm">
                  <BarChart3 className="h-8 w-8 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Statistics & Analytics
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive business insights and analytics
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <StatisticsTab />
      </div>
    </div>
  );
}
