import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, FileText, CheckCircle, XCircle, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface OfferDialogProps {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  recruitmentId: string;
}

export function OfferDialog({ open, onClose, candidateId, candidateName, recruitmentId }: OfferDialogProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    offered_salary: "",
    offered_position: "",
    offered_department: "",
    joining_date: "",
    expiry_date: "",
    negotiation_notes: "",
  });

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["hr_offer_letters", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_offer_letters")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_offer_letters").insert({
        candidate_id: candidateId,
        recruitment_id: recruitmentId,
        offered_salary: parseFloat(form.offered_salary),
        offered_position: form.offered_position || null,
        offered_department: form.offered_department || null,
        joining_date: form.joining_date || null,
        expiry_date: form.expiry_date || null,
        negotiation_notes: form.negotiation_notes || null,
        status: "sent",
      });
      if (error) throw error;
      // Update candidate offer_letter_status
      await supabase.from("hr_candidates").update({ offer_letter_status: "sent" }).eq("id", candidateId);
    },
    onSuccess: () => {
      toast.success("Offer letter created");
      queryClient.invalidateQueries({ queryKey: ["hr_offer_letters", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
      setShowCreate(false);
      setForm({ offered_salary: "", offered_position: "", offered_department: "", joining_date: "", expiry_date: "", negotiation_notes: "" });
    },
    onError: () => toast.error("Failed to create offer"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "accepted") updates.accepted_at = new Date().toISOString();
      if (status === "rejected") updates.rejected_at = new Date().toISOString();
      const { error } = await supabase.from("hr_offer_letters").update(updates).eq("id", id);
      if (error) throw error;
      // Update candidate status too
      await supabase.from("hr_candidates").update({ offer_letter_status: status }).eq("id", candidateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_offer_letters", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidate", candidateId] });
      toast.success("Offer status updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update offer status"),
  });

  if (!open) return null;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const STATUS_STYLES: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-amber-100 text-amber-700",
    negotiating: "bg-violet-100 text-violet-700",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Offer Letters — {candidateName}</h2>
            <p className="text-xs text-gray-500">{offers.length} offer(s)</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {showCreate ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Create Offer Letter</h3>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Offered Salary *</label>
                <input type="number" value={form.offered_salary} onChange={e => setForm({ ...form, offered_salary: e.target.value })} className={inputCls} placeholder="e.g. 60000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Position</label>
                  <input value={form.offered_position} onChange={e => setForm({ ...form, offered_position: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
                  <input value={form.offered_department} onChange={e => setForm({ ...form, offered_department: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Joining Date</label>
                  <input type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Offer Expiry</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Negotiation Notes</label>
                <textarea value={form.negotiation_notes} onChange={e => setForm({ ...form, negotiation_notes: e.target.value })}
                  className={`${inputCls} resize-none`} rows={3} placeholder="Salary expectations, special terms..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={() => createMutation.mutate()}
                  disabled={!form.offered_salary || createMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                  {createMutation.isPending ? "Creating..." : "Send Offer"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button onClick={() => setShowCreate(true)}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-3 text-sm text-[#E8604C] font-medium hover:border-[#E8604C]/30 transition-colors">
                + Create New Offer
              </button>

              {isLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
              ) : offers.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No offers created yet</p>
                </div>
              ) : offers.map(offer => (
                <div key={offer.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="text-lg font-bold text-gray-900">₹{Number(offer.offered_salary).toLocaleString()}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[offer.status] || "bg-gray-100 text-gray-600"}`}>
                          {offer.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {offer.offered_position && <span>{offer.offered_position}</span>}
                        {offer.offered_department && <span>• {offer.offered_department}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>Offered: {new Date(offer.offer_date).toLocaleDateString()}</span>
                        {offer.joining_date && <span>Join: {new Date(offer.joining_date).toLocaleDateString()}</span>}
                        {offer.expiry_date && <span>Expires: {new Date(offer.expiry_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {offer.status === "sent" && (
                      <div className="flex gap-1">
                        <button onClick={() => updateStatusMutation.mutate({ id: offer.id, status: "accepted" })}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Accept">
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateStatusMutation.mutate({ id: offer.id, status: "negotiating" })}
                          className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600" title="Negotiating">
                          <DollarSign className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateStatusMutation.mutate({ id: offer.id, status: "rejected" })}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Reject">
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {offer.status === "negotiating" && (
                      <div className="flex gap-1">
                        <button onClick={() => updateStatusMutation.mutate({ id: offer.id, status: "accepted" })}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Accept">
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateStatusMutation.mutate({ id: offer.id, status: "rejected" })}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Reject">
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {offer.negotiation_notes && (
                    <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{offer.negotiation_notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
