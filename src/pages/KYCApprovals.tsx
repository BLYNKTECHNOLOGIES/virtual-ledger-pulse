
import { UserCheck } from "lucide-react";
import { KYCApprovalsTab } from "@/components/hrms/KYCApprovalsTab";

export default function KYCApprovals() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-green-200 via-emerald-200 to-teal-200 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-green-100 rounded-xl shadow-lg">
                  <UserCheck className="h-8 w-8 text-green-700" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    KYC Approvals
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Know Your Customer verification and approval system
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <KYCApprovalsTab />
      </div>
    </div>
  );
}
