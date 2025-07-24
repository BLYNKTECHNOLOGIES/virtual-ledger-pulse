
import { Users } from "lucide-react";
import { ClientDashboard } from "@/components/clients/ClientDashboard";

export default function Clients() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-50 rounded-xl shadow-sm">
                  <Users className="h-8 w-8 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Client Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Comprehensive client relationship management
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ClientDashboard />
    </div>
  );
}
