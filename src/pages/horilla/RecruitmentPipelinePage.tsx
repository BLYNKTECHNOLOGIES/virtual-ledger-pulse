import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  useDroppable
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, GripVertical, Star, X, ArrowLeft, Trash2,
  Calendar, FileText
} from "lucide-react";
import { toast } from "sonner";
import { InterviewDialog } from "@/components/horilla/recruitment/InterviewDialog";
import { OfferDialog } from "@/components/horilla/recruitment/OfferDialog";

interface Stage {
  id: string;
  stage_name: string;
  sequence: number;
  stage_type: string;
  recruitment_id: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  stage_id: string | null;
  recruitment_id: string | null;
  hired: boolean | null;
  canceled: boolean | null;
  rating: number | null;
  source: string | null;
  profile_image_url: string | null;
  schedule_date: string | null;
  offer_letter_status: string | null;
  created_at: string;
}

const STAGE_COLORS: Record<string, string> = {
  initial: "border-t-blue-400",
  test: "border-t-amber-400",
  interview: "border-t-violet-400",
  offer: "border-t-emerald-400",
  hired: "border-t-green-500",
  cancelled: "border-t-red-400",
  other: "border-t-gray-400",
};

/* ─── Draggable Candidate Card ─── */
function CandidateCard({ candidate, stages, currentStageId, onMove, onHire, onCancel, onInterview, onOffer }: {
  candidate: Candidate;
  stages: Stage[];
  currentStageId: string;
  onMove: (candidateId: string, newStageId: string) => void;
  onHire: (id: string) => void;
  onCancel: (id: string) => void;
  onInterview: (c: Candidate) => void;
  onOffer: (c: Candidate) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
    data: { type: "candidate", stageId: currentStageId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];
  const stageIdx = stages.findIndex(s => s.id === currentStageId);

  return (
    <div ref={setNodeRef} style={style}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all group">
      <div className="flex items-start gap-2.5">
        <div {...attributes} {...listeners} className="mt-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        {candidate.profile_image_url ? (
          <img src={candidate.profile_image_url} className="w-8 h-8 rounded-full object-cover" alt="" />
        ) : (
          <div className={`w-8 h-8 rounded-full ${getColor(candidate.id)} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
            {initials(candidate.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{candidate.name}</p>
          {candidate.email && <p className="text-[11px] text-gray-400 truncate">{candidate.email}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
        {stageIdx < stages.length - 1 && (
          <button onClick={() => onMove(candidate.id, stages[stageIdx + 1].id)}
            className="text-[10px] text-[#E8604C] hover:underline px-1">Next →</button>
        )}
        <button onClick={() => onInterview(candidate)}
          className="text-[10px] text-blue-600 hover:underline px-1 flex items-center gap-0.5">
          <Calendar className="h-2.5 w-2.5" />Interview
        </button>
        <button onClick={() => onOffer(candidate)}
          className="text-[10px] text-violet-600 hover:underline px-1 flex items-center gap-0.5">
          <FileText className="h-2.5 w-2.5" />Offer
        </button>
        {!candidate.hired && !candidate.canceled && (
          <button onClick={() => onHire(candidate.id)}
            className="text-[10px] text-emerald-600 hover:underline px-1">Hire ✓</button>
        )}
        {!candidate.canceled && !candidate.hired && (
          <button onClick={() => onCancel(candidate.id)}
            className="text-[10px] text-red-500 hover:underline px-1">Cancel ✗</button>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {candidate.rating !== null && candidate.rating > 0 && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-3 w-3 ${i < (candidate.rating || 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
            ))}
          </div>
        )}
        {candidate.source && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{candidate.source}</span>
        )}
        {candidate.offer_letter_status && candidate.offer_letter_status !== "none" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            candidate.offer_letter_status === "accepted" ? "bg-emerald-100 text-emerald-700" :
            candidate.offer_letter_status === "rejected" ? "bg-red-100 text-red-700" :
            candidate.offer_letter_status === "sent" ? "bg-blue-100 text-blue-700" :
            "bg-gray-100 text-gray-600"
          }`}>
            Offer: {candidate.offer_letter_status}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Droppable Stage Column ─── */
function StageColumn({ stage, children, candidateIds }: {
  stage: Stage;
  children: React.ReactNode;
  candidateIds: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
    data: { type: "stage", stageId: stage.id },
  });

  return (
    <SortableContext items={candidateIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-[100px] rounded-b-xl transition-colors ${
          isOver ? "bg-blue-50/50 ring-2 ring-blue-200 ring-inset" : ""
        }`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

/* ─── Main Pipeline Page ─── */
export default function RecruitmentPipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const selectedRecId = searchParams.get("id");
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [addCandidateStageId, setAddCandidateStageId] = useState<string | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ name: "", email: "", mobile: "", source: "" });
  const [stageForm, setStageForm] = useState({ stage_name: "", stage_type: "other" });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [interviewCandidate, setInterviewCandidate] = useState<Candidate | null>(null);
  const [offerCandidate, setOfferCandidate] = useState<Candidate | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: recruitments } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_recruitments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const activeRec = selectedRecId
    ? recruitments?.find(r => r.id === selectedRecId)
    : recruitments?.[0];

  const { data: stages } = useQuery({
    queryKey: ["hr_stages", activeRec?.id],
    queryFn: async () => {
      if (!activeRec) return [];
      const { data, error } = await supabase.from("hr_stages").select("*").eq("recruitment_id", activeRec.id).order("sequence");
      if (error) throw error;
      return (data || []) as Stage[];
    },
    enabled: !!activeRec,
  });

  const { data: candidates } = useQuery({
    queryKey: ["hr_candidates", activeRec?.id],
    queryFn: async () => {
      if (!activeRec) return [];
      const { data, error } = await supabase.from("hr_candidates").select("*").eq("recruitment_id", activeRec.id).order("sequence");
      if (error) throw error;
      return (data || []) as Candidate[];
    },
    enabled: !!activeRec,
  });

  const addCandidateMutation = useMutation({
    mutationFn: async () => {
      if (!activeRec || !addCandidateStageId) return;
      const { error } = await supabase.from("hr_candidates").insert({
        name: candidateForm.name,
        email: candidateForm.email || null,
        mobile: candidateForm.mobile || null,
        source: candidateForm.source || null,
        recruitment_id: activeRec.id,
        stage_id: addCandidateStageId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
      setAddCandidateOpen(false);
      setCandidateForm({ name: "", email: "", mobile: "", source: "" });
    },
  });

  const addStageMutation = useMutation({
    mutationFn: async () => {
      if (!activeRec) return;
      const maxSeq = (stages || []).reduce((m, s) => Math.max(m, s.sequence), 0);
      const { error } = await supabase.from("hr_stages").insert({
        stage_name: stageForm.stage_name,
        stage_type: stageForm.stage_type,
        recruitment_id: activeRec.id,
        sequence: maxSeq + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_stages"] });
      setAddStageOpen(false);
      setStageForm({ stage_name: "", stage_type: "other" });
    },
  });

  const moveCandidateMutation = useMutation({
    mutationFn: async ({ candidateId, newStageId }: { candidateId: string; newStageId: string }) => {
      const { error } = await supabase.from("hr_candidates").update({ stage_id: newStageId }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate moved");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
    },
  });

  const hireCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.from("hr_candidates").update({ hired: true, canceled: false, hired_date: new Date().toISOString().split("T")[0] }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate marked as hired");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
    },
  });

  const cancelCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.from("hr_candidates").update({ canceled: true, hired: false }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate canceled");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
    },
  });

  const getCandidatesForStage = (stageId: string) =>
    (candidates || []).filter(c => c.stage_id === stageId);

  const stageColor = (type: string) => STAGE_COLORS[type] || STAGE_COLORS.other;

  /* ─── DnD Handlers ─── */
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const resolveStageId = (overId: string | number, overData: any): string | null => {
    // If dropped on a droppable stage column
    if (overData?.type === "stage") return overData.stageId;
    // If dropped on another candidate
    if (overData?.type === "candidate") return overData.stageId;
    // If overId starts with "stage-" it's a stage droppable
    const overStr = String(overId);
    if (overStr.startsWith("stage-")) return overStr.replace("stage-", "");
    // Check if overId matches a stage id directly
    if (stages?.find(s => s.id === overStr)) return overStr;
    return null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Optional: Could add optimistic UI here
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !stages) return;

    const candidateId = active.id as string;
    const targetStageId = resolveStageId(over.id, over.data?.current);
    if (!targetStageId) return;

    const currentCandidate = candidates?.find(c => c.id === candidateId);
    if (currentCandidate && currentCandidate.stage_id !== targetStageId) {
      moveCandidateMutation.mutate({ candidateId, newStageId: targetStageId });
    }
  };

  const draggedCandidate = activeDragId ? candidates?.find(c => c.id === activeDragId) : null;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/hrms/recruitment")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{activeRec?.title || "Pipeline"}</h1>
            <p className="text-xs text-gray-500">
              {activeRec ? `${activeRec.vacancy || 0} vacancies · ${(candidates || []).length} candidates · Drag to move between stages` : "Select a recruitment"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recruitments && recruitments.length > 1 && (
            <select value={activeRec?.id || ""}
              onChange={e => navigate(`/hrms/recruitment/pipeline?id=${e.target.value}`)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white">
              {recruitments.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          )}
          <button onClick={() => setAddStageOpen(true)}
            className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" /> Add Stage
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {!activeRec ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No active recruitment found. Create one first.
        </div>
      ) : !stages?.length ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-sm">No stages defined for this recruitment</p>
            <button onClick={() => setAddStageOpen(true)} className="mt-2 text-[#E8604C] text-sm font-medium hover:underline">
              + Add first stage
            </button>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 h-full min-h-[500px] pb-4">
              {stages.map(stage => {
                const stageCandidates = getCandidatesForStage(stage.id);
                return (
                  <div key={stage.id}
                    className={`w-72 shrink-0 bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${stageColor(stage.stage_type)} flex flex-col`}>
                    {/* Stage header */}
                    <div className="px-3 py-3 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{stage.stage_name}</h3>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                          {stageCandidates.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => { setAddCandidateStageId(stage.id); setAddCandidateOpen(true); }}
                          className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-[#E8604C] transition-colors"
                          title="Add candidate">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (stageCandidates.length > 0) { toast.error("Remove all candidates first"); return; }
                            if (confirm(`Delete stage "${stage.stage_name}"?`)) {
                              supabase.from("hr_stages").delete().eq("id", stage.id).then(({ error }) => {
                                if (error) toast.error("Failed to delete");
                                else { toast.success("Stage deleted"); queryClient.invalidateQueries({ queryKey: ["hr_stages"] }); }
                              });
                            }
                          }}
                          className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete stage">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Droppable stage body */}
                    <StageColumn stage={stage} candidateIds={stageCandidates.map(c => c.id)}>
                      {stageCandidates.map(c => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          stages={stages}
                          currentStageId={stage.id}
                          onMove={(cId, sId) => moveCandidateMutation.mutate({ candidateId: cId, newStageId: sId })}
                          onHire={(id) => hireCandidateMutation.mutate(id)}
                          onCancel={(id) => cancelCandidateMutation.mutate(id)}
                          onInterview={(c) => setInterviewCandidate(c)}
                          onOffer={(c) => setOfferCandidate(c)}
                        />
                      ))}
                      {stageCandidates.length === 0 && (
                        <div className="text-center py-6">
                          <p className="text-xs text-gray-400">No candidates</p>
                          <button
                            onClick={() => { setAddCandidateStageId(stage.id); setAddCandidateOpen(true); }}
                            className="text-xs text-[#E8604C] mt-1 hover:underline">
                            + Add candidate
                          </button>
                        </div>
                      )}
                    </StageColumn>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
            {draggedCandidate && (
              <div className="bg-white rounded-lg border-2 border-[#E8604C] p-3 shadow-xl w-64 opacity-95 rotate-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-white font-medium text-xs">
                    {draggedCandidate.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{draggedCandidate.name}</p>
                    {draggedCandidate.email && <p className="text-[11px] text-gray-400">{draggedCandidate.email}</p>}
                  </div>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add Candidate Dialog */}
      {addCandidateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
              <button onClick={() => setAddCandidateOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                <input value={candidateForm.name}
                  onChange={e => setCandidateForm({ ...candidateForm, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <input type="email" value={candidateForm.email}
                    onChange={e => setCandidateForm({ ...candidateForm, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Mobile</label>
                  <input value={candidateForm.mobile}
                    onChange={e => setCandidateForm({ ...candidateForm, mobile: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Source</label>
                <select value={candidateForm.source}
                  onChange={e => setCandidateForm({ ...candidateForm, source: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]">
                  <option value="">Select</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Indeed">Indeed</option>
                  <option value="Referral">Referral</option>
                  <option value="Website">Website</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddCandidateOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => addCandidateMutation.mutate()}
                disabled={!candidateForm.name || addCandidateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {addCandidateMutation.isPending ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stage Dialog */}
      {addStageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Stage</h2>
              <button onClick={() => setAddStageOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Name *</label>
                <input value={stageForm.stage_name}
                  onChange={e => setStageForm({ ...stageForm, stage_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="e.g. Technical Interview" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Type</label>
                <select value={stageForm.stage_type}
                  onChange={e => setStageForm({ ...stageForm, stage_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]">
                  <option value="initial">Initial Screening</option>
                  <option value="test">Test / Assessment</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="hired">Hired</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddStageOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => addStageMutation.mutate()}
                disabled={!stageForm.stage_name || addStageMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {addStageMutation.isPending ? "Adding..." : "Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interview Dialog */}
      {interviewCandidate && activeRec && (
        <InterviewDialog
          open={!!interviewCandidate}
          onClose={() => setInterviewCandidate(null)}
          candidateId={interviewCandidate.id}
          candidateName={interviewCandidate.name}
          recruitmentId={activeRec.id}
          stageId={interviewCandidate.stage_id}
        />
      )}

      {/* Offer Dialog */}
      {offerCandidate && activeRec && (
        <OfferDialog
          open={!!offerCandidate}
          onClose={() => setOfferCandidate(null)}
          candidateId={offerCandidate.id}
          candidateName={offerCandidate.name}
          recruitmentId={activeRec.id}
        />
      )}
    </div>
  );
}
