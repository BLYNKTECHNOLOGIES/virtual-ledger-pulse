
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Briefcase, CheckCircle, XCircle, Search } from "lucide-react";
import { CreateRecruitmentDialog } from "./CreateRecruitmentDialog";
import { RecruitmentPipeline } from "./RecruitmentPipeline";

export function RecruitmentDashboard() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRecruitment, setSelectedRecruitment] = useState<string | null>(null);

  const { data: recruitments = [], refetch } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_recruitments")
        .select("*, hr_stages(*), hr_candidates(id, hired, canceled, stage_id)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const openRecruitments = recruitments.filter((r: any) => !r.closed);
  const closedRecruitments = recruitments.filter((r: any) => r.closed);
  const totalCandidates = recruitments.reduce((sum: number, r: any) => sum + (r.hr_candidates?.length || 0), 0);
  const totalHired = recruitments.reduce((sum: number, r: any) => sum + (r.hr_candidates?.filter((c: any) => c.hired)?.length || 0), 0);

  if (selectedRecruitment) {
    return <RecruitmentPipeline recruitmentId={selectedRecruitment} onBack={() => setSelectedRecruitment(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Open Recruitments", value: openRecruitments.length, icon: Briefcase, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
          { title: "Total Candidates", value: totalCandidates, icon: Users, iconBg: "bg-green-100", iconColor: "text-green-600" },
          { title: "Total Hired", value: totalHired, icon: CheckCircle, iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
          { title: "Closed Recruitments", value: closedRecruitments.length, icon: XCircle, iconBg: "bg-gray-100", iconColor: "text-gray-600" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                  </div>
                  <div className={`${card.iconBg} w-10 h-10 rounded-lg flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Header + Create */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Recruitment Campaigns</h3>
        <Button size="sm" className="h-9 bg-[#009C4A] hover:bg-[#008040] text-white text-xs" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Create
        </Button>
      </div>

      {/* Recruitment List */}
      {recruitments.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="h-10 w-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No recruitment campaigns yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recruitments.map((rec: any) => {
            const candidateCount = rec.hr_candidates?.length || 0;
            const hiredCount = rec.hr_candidates?.filter((c: any) => c.hired)?.length || 0;
            const stageCount = rec.hr_stages?.length || 0;
            return (
              <Card
                key={rec.id}
                className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedRecruitment(rec.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">{rec.title}</h4>
                      {rec.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rec.description}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${rec.closed ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                      {rec.closed ? "Closed" : "Open"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{candidateCount} candidates</span>
                    <span>{hiredCount} hired</span>
                    <span>{stageCount} stages</span>
                    <span>Vacancy: {rec.vacancy}</span>
                  </div>
                  {rec.start_date && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      {new Date(rec.start_date).toLocaleDateString()} — {rec.end_date ? new Date(rec.end_date).toLocaleDateString() : "Ongoing"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateRecruitmentDialog open={showCreate} onOpenChange={setShowCreate} onSuccess={refetch} />
    </div>
  );
}
