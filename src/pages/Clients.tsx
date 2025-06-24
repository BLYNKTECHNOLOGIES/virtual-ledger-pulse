
import { ClientDashboard } from "@/components/clients/ClientDashboard";

export default function Clients() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-gray-900">
            Client Management
          </h1>
          <p className="text-gray-600 mt-1 text-sm lg:text-base">
            Manage all your clients and their information in one place
          </p>
        </div>
      </div>
      
      <div className="modern-card">
        <ClientDashboard />
      </div>
    </div>
  );
}
