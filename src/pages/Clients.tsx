
import { Users } from "lucide-react";
import { ClientDashboard } from "@/components/clients/ClientDashboard";

export default function Clients() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-cyan-600 to-blue-700 text-white rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-700 rounded-xl shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Client Management
                  </h1>
                  <p className="text-teal-200 text-lg">
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
