
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Phone, User, Star, CheckCircle, XCircle } from "lucide-react";
import { StatusBadge } from "../shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";

interface CandidateProfileProps {
  candidateId: string;
  onBack: () => void;
}

export function CandidateProfile({ candidateId, onBack }: CandidateProfileProps) {
  const { toast } = useToast();

  const { data: candidate, isLoading, refetch } = useQuery({
    queryKey: ["hr_candidate_profile", candidateId],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("*, hr_stage_notes(*), hr_candidate_ratings(*)").eq("id", candidateId).single();
      return data;
    },
  });

  const markHired = async () => {
    await supabase.from("hr_candidates").update({ hired: true, hired_date: new Date().toISOString().split("T")[0] }).eq("id", candidateId);
    refetch();
    toast({ title: "Candidate marked as hired" });
  };

  const markRejected = async () => {
    await supabase.from("hr_candidates").update({ canceled: true }).eq("id", candidateId);
    await supabase.from("hr_rejected_candidates").insert({ candidate_id: candidateId, reject_reason: "Rejected" });
    refetch();
    toast({ title: "Candidate rejected" });
  };

  const updateOfferStatus = async (status: string) => {
    await supabase.from("hr_candidates").update({ offer_letter_status: status }).eq("id", candidateId);
    refetch();
    toast({ title: `Offer letter status: ${status}` });
  };

  if (isLoading || !candidate) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#009C4A]" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border border-gray-100 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-400 -ml-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-lg font-bold">
                {candidate.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">{candidate.name}</h2>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  {candidate.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {candidate.email}</span>}
                  {candidate.mobile && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {candidate.mobile}</span>}
                  {candidate.gender && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {candidate.gender}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  {candidate.hired && <StatusBadge status="hired" />}
                  {candidate.canceled && <StatusBadge status="rejected" />}
                  {!candidate.hired && !candidate.canceled && <StatusBadge status="in_progress" />}
                  <span className="text-[10px] text-gray-400 capitalize">Source: {candidate.source}</span>
                  <span className="text-[10px] text-gray-400 capitalize">Offer: {candidate.offer_letter_status?.replace(/_/g, " ")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!candidate.hired && !candidate.canceled && (
                <>
                  <Button size="sm" className="h-8 bg-[#009C4A] hover:bg-[#008040] text-white text-xs" onClick={markHired}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark Hired
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={markRejected}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personal Info */}
        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Personal Information</h3>
            <div className="space-y-3">
              {[
                ["Name", candidate.name],
                ["Email", candidate.email || "—"],
                ["Mobile", candidate.mobile || "—"],
                ["Gender", candidate.gender || "—"],
                ["Date of Birth", candidate.dob ? new Date(candidate.dob).toLocaleDateString() : "—"],
                ["Address", [candidate.address, candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "—"],
                ["Source", candidate.source],
                ["Joining Date", candidate.joining_date ? new Date(candidate.joining_date).toLocaleDateString() : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start">
                  <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
                  <span className="text-xs text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Offer Letter Status */}
        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Offer Letter Tracking</h3>
            <div className="flex flex-wrap gap-2">
              {["not_sent", "sent", "accepted", "rejected", "joined"].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={candidate.offer_letter_status === status ? "default" : "outline"}
                  className={`text-[10px] h-7 capitalize ${candidate.offer_letter_status === status ? 'bg-[#009C4A] text-white' : ''}`}
                  onClick={() => updateOfferStatus(status)}
                >
                  {status.replace(/_/g, " ")}
                </Button>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3">Rating</h3>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-5 w-5 ${i < (candidate.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
              ))}
              <span className="text-xs text-gray-400 ml-2">{candidate.rating || 0}/5</span>
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3">Stage Notes</h3>
            {(candidate.hr_stage_notes?.length || 0) === 0 ? (
              <p className="text-xs text-gray-400">No stage notes yet</p>
            ) : (
              <div className="space-y-2">
                {candidate.hr_stage_notes?.map((note: any) => (
                  <div key={note.id} className="p-2 bg-gray-50 rounded text-xs text-gray-700">
                    {note.description}
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
