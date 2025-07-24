
import { Video } from "lucide-react";
import { VideoKYCTab } from "@/components/hrms/VideoKYCTab";

export default function VideoKYC() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-700 rounded-xl shadow-lg">
                  <Video className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Video KYC
                  </h1>
                  <p className="text-blue-200 text-lg">
                    Video-based customer verification system
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
      <VideoKYCTab />
      </div>
    </div>
  );
}
