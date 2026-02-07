
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, MoreVertical, Star, GripVertical, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "../shared/StatusBadge";
import { CandidateProfile } from "./CandidateProfile";

interface RecruitmentPipelineProps {
  recruitmentId: string;
  onBack: () => void;
}

export function RecruitmentPipeline({ recruitmentId, onBack }: RecruitmentPipelineProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showAddStage, setShowAddStage] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [newStageType, setNewStageType] = useState("applied");

  // Candidate form
  const [candidateForm, setCandidateForm] = useState({ name: "", email: "", mobile: "", gender: "", source: "application" });

  const { data: recruitment } = useQuery({
    queryKey: ["hr_recruitment_detail", recruitmentId],
    queryFn: async () => {
      const { data } = await supabase.from("hr_recruitments").select("*").eq("id", recruitmentId).single();
      return data;
    },
  });

  const { data: stages = [], refetch: refetchStages } = useQuery({
    queryKey: ["hr_stages", recruitmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_stages")
        .select("*")
        .eq("recruitment_id", recruitmentId)
        .order("sequence", { ascending: true });
      return data || [];
    },
  });

  const { data: candidates = [], refetch: refetchCandidates } = useQuery({
    queryKey: ["hr_candidates", recruitmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_candidates")
        .select("*")
        .eq("recruitment_id", recruitmentId)
        .order("sequence", { ascending: true });
      return data || [];
    },
  });

  const addStage = useMutation({
    mutationFn: async () => {
      if (!newStageName.trim()) return;
      await supabase.from("hr_stages").insert({
        recruitment_id: recruitmentId,
        stage_name: newStageName,
        stage_type: newStageType,
        sequence: stages.length,
      });
    },
    onSuccess: () => {
      refetchStages();
      setShowAddStage(false);
      setNewStageName("");
      toast({ title: "Stage added" });
    },
  });

  const addCandidate = useMutation({
    mutationFn: async () => {
      if (!candidateForm.name.trim()) return;
      const firstStage = stages[0];
      await supabase.from("hr_candidates").insert({
        name: candidateForm.name,
        email: candidateForm.email || null,
        mobile: candidateForm.mobile || null,
        gender: candidateForm.gender || null,
        source: candidateForm.source,
        recruitment_id: recruitmentId,
        stage_id: firstStage?.id || null,
        sequence: candidates.length,
      });
    },
    onSuccess: () => {
      refetchCandidates();
      setShowAddCandidate(false);
      setCandidateForm({ name: "", email: "", mobile: "", gender: "", source: "application" });
      toast({ title: "Candidate added" });
    },
  });

  const moveCandidate = async (candidateId: string, newStageId: string) => {
    await supabase.from("hr_candidates").update({ stage_id: newStageId }).eq("id", candidateId);
    refetchCandidates();
    toast({ title: "Candidate moved" });
  };

  const markHired = async (candidateId: string) => {
    await supabase.from("hr_candidates").update({ hired: true, hired_date: new Date().toISOString().split("T")[0] }).eq("id", candidateId);
    refetchCandidates();
    toast({ title: "Candidate marked as hired" });
  };

  const markRejected = async (candidateId: string) => {
    await supabase.from("hr_candidates").update({ canceled: true }).eq("id", candidateId);
    await supabase.from("hr_rejected_candidates").insert({ candidate_id: candidateId, reject_reason: "Rejected" });
    refetchCandidates();
    toast({ title: "Candidate rejected" });
  };

  if (selectedCandidate) {
    return <CandidateProfile candidateId={selectedCandidate} onBack={() => setSelectedCandidate(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{recruitment?.title || "Recruitment"}</h2>
            <p className="text-xs text-gray-400">{candidates.length} candidates · {stages.length} stages</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddStage(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
          </Button>
          <Button size="sm" className="h-8 bg-[#009C4A] hover:bg-[#008040] text-white text-xs" onClick={() => setShowAddCandidate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Candidate
          </Button>
        </div>
      </div>

      {/* Kanban Pipeline */}
      {stages.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="h-10 w-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No stages yet. Add stages to start the pipeline.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage: any) => {
            const stageCandidates = candidates.filter((c: any) => c.stage_id === stage.id && !c.canceled);
            return (
              <div key={stage.id} className="min-w-[280px] max-w-[280px] flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-gray-700">{stage.stage_name}</h4>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{stageCandidates.length}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 capitalize">{stage.stage_type}</span>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-2 space-y-2 min-h-[200px]">
                  {stageCandidates.map((candidate: any) => (
                    <Card
                      key={candidate.id}
                      className="border border-gray-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedCandidate(candidate.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-[10px] font-bold">
                              {candidate.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-800">{candidate.name}</p>
                              <p className="text-[10px] text-gray-400">{candidate.email || candidate.source}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {candidate.rating > 0 && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-3 w-3 ${i < candidate.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                              ))}
                            </div>
                          )}
                          {candidate.hired && <StatusBadge status="hired" />}
                          <span className="text-[10px] capitalize text-gray-400">{candidate.offer_letter_status?.replace(/_/g, " ")}</span>
                        </div>
                        {/* Quick actions */}
                        <div className="flex items-center gap-1 mt-2">
                          {stages.map((s: any) => (
                            s.id !== stage.id && (
                              <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); moveCandidate(candidate.id, s.id); }}
                                className="text-[9px] px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-500 truncate max-w-[60px]"
                                title={`Move to ${s.stage_name}`}
                              >
                                → {s.stage_name}
                              </button>
                            )
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Hired column */}
          <div className="min-w-[280px] max-w-[280px] flex flex-col">
            <div className="flex items-center gap-2 mb-2 px-1">
              <h4 className="text-xs font-semibold text-green-700">Hired</h4>
              <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                {candidates.filter((c: any) => c.hired).length}
              </span>
            </div>
            <div className="flex-1 bg-green-50 rounded-lg p-2 space-y-2 min-h-[200px]">
              {candidates.filter((c: any) => c.hired).map((candidate: any) => (
                <Card key={candidate.id} className="border border-green-100 shadow-sm cursor-pointer" onClick={() => setSelectedCandidate(candidate.id)}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-[10px] font-bold">
                        {candidate.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{candidate.name}</p>
                        <p className="text-[10px] text-green-600">Hired {candidate.hired_date || ""}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Rejected column */}
          <div className="min-w-[280px] max-w-[280px] flex flex-col">
            <div className="flex items-center gap-2 mb-2 px-1">
              <h4 className="text-xs font-semibold text-red-700">Rejected</h4>
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                {candidates.filter((c: any) => c.canceled).length}
              </span>
            </div>
            <div className="flex-1 bg-red-50 rounded-lg p-2 space-y-2 min-h-[200px]">
              {candidates.filter((c: any) => c.canceled).map((candidate: any) => (
                <Card key={candidate.id} className="border border-red-100 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center text-red-700 text-[10px] font-bold">
                        {candidate.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </div>
                      <p className="text-xs font-semibold text-gray-800">{candidate.name}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Stage Dialog */}
      <Dialog open={showAddStage} onOpenChange={setShowAddStage}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Stage Name</Label>
              <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)} className="text-sm h-9" placeholder="e.g. Technical Interview" />
            </div>
            <div>
              <Label className="text-xs">Stage Type</Label>
              <Select value={newStageType} onValueChange={setNewStageType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["initial", "applied", "test", "interview", "cancelled", "hired"].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#009C4A] hover:bg-[#008040] text-xs" onClick={() => addStage.mutate()}>Add Stage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Candidate Dialog */}
      <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={candidateForm.name} onChange={(e) => setCandidateForm(p => ({ ...p, name: e.target.value }))} className="text-sm h-9" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={candidateForm.email} onChange={(e) => setCandidateForm(p => ({ ...p, email: e.target.value }))} className="text-sm h-9" />
            </div>
            <div>
              <Label className="text-xs">Mobile</Label>
              <Input value={candidateForm.mobile} onChange={(e) => setCandidateForm(p => ({ ...p, mobile: e.target.value }))} className="text-sm h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Gender</Label>
                <Select value={candidateForm.gender} onValueChange={(v) => setCandidateForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Source</Label>
                <Select value={candidateForm.source} onValueChange={(v) => setCandidateForm(p => ({ ...p, source: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">Application</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#009C4A] hover:bg-[#008040] text-xs" onClick={() => addCandidate.mutate()}>Add Candidate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
