
import { BarChart3 } from "lucide-react";
import { StatisticsTab } from "@/components/hrms/StatisticsTab";

export default function Statistics() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-600 via-gray-600 to-zinc-700 text-white rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-slate-700 rounded-xl shadow-lg">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Statistics & Analytics
                  </h1>
                  <p className="text-slate-200 text-lg">
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
