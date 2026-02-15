import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Filter, Mail, Phone, Star, Eye, Edit, Trash2,
  UserCheck, UserX, X, Building2
} from "lucide-react";

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  hired: boolean | null;
  canceled: boolean | null;
  rating: number | null;
  source: string | null;
  profile_image_url: string | null;
  stage_id: string | null;
  recruitment_id: string | null;
  created_at: string;
  schedule_date: string | null;
  offer_letter_status: string | null;
}

export default function CandidatesListPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "hired" | "canceled" | "active">("all");

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["hr_candidates_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_candidates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  const { data: recruitments } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_recruitments").select("id, title");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: stages } = useQuery({
    queryKey: ["hr_stages_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_stages").select("id, stage_name");
      if (error) throw error;
      return data || [];
    },
  });

  const getRecTitle = (recId: string | null) => recruitments?.find(r => r.id === recId)?.title || "—";
  const getStageName = (stageId: string | null) => stages?.find(s => s.id === stageId)?.stage_name || "—";

  const filtered = (candidates || []).filter(c => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = c.name.toLowerCase().includes(term) ||
      (c.email || "").toLowerCase().includes(term) ||
      (c.mobile || "").includes(term);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "hired" && c.hired) ||
      (statusFilter === "canceled" && c.canceled) ||
      (statusFilter === "active" && !c.hired && !c.canceled);
    return matchesSearch && matchesStatus;
  });

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const hiredCount = (candidates || []).filter(c => c.hired).length;
  const canceledCount = (candidates || []).filter(c => c.canceled).length;
  const activeCount = (candidates || []).filter(c => !c.hired && !c.canceled).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Candidates</h1>
        <p className="text-xs text-gray-500 mt-0.5">All candidates across recruitments</p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              statusFilter === "active" ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            In Progress ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "hired" ? "all" : "hired")}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              statusFilter === "hired" ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <UserCheck className="h-3 w-3" /> Hired ({hiredCount})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === "canceled" ? "all" : "canceled")}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              statusFilter === "canceled" ? "bg-red-100 text-red-700 ring-1 ring-red-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <UserX className="h-3 w-3" /> Canceled ({canceledCount})
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm">No candidates found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Recruitment</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Stage</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Source</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Rating</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.email || c.mobile || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{getRecTitle(c.recruitment_id)}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {getStageName(c.stage_id)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{c.source || "—"}</td>
                  <td className="py-3 px-4">
                    {c.rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < c.rating! ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {c.hired ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Hired</span>
                    ) : c.canceled ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Canceled</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In Progress</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
