
import { Users } from "lucide-react";
import { ClientDashboard } from "@/components/clients/ClientDashboard";

export default function Clients() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-200 via-cyan-200 to-blue-200 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-100 rounded-xl shadow-lg">
                  <Users className="h-8 w-8 text-teal-700" />
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
