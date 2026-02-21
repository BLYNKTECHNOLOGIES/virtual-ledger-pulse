import { useState } from "react";
import { useMutation, QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, ArrowUpDown } from "lucide-react";

interface LeaveTabProps {
  employeeId: string;
  leaveAllocations: any[];
  leaveRequests: any[];
  leaveTypes: any[];
  queryClient: QueryClient;
}

export function LeaveTab({
  employeeId,
  leaveAllocations,
  leaveRequests,
  leaveTypes,
  queryClient,
}: LeaveTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const getLeaveType = (typeId: string) => leaveTypes.find((t: any) => t.id === typeId);

  // ─── Mutations ───
  const updateStatusMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const updateData: any = { status };
      if (status === "Approved") {
        updateData.approved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("hr_leave_requests")
        .update(updateData)
        .eq("id", requestId);
      if (error) throw error;

      // Update used_days in allocation if approving
      if (status === "Approved") {
        const req = leaveRequests.find((r: any) => r.id === requestId);
        if (req) {
          const alloc = leaveAllocations.find((a: any) => a.leave_type_id === req.leave_type_id);
          if (alloc) {
            await supabase
              .from("hr_leave_allocations")
              .update({ used_days: alloc.used_days + req.total_days })
              .eq("id", alloc.id);
          }
        }
      }

      // If cancelling a previously approved request, restore used_days
      if (status === "Cancelled") {
        const req = leaveRequests.find((r: any) => r.id === requestId);
        if (req && req.status === "Approved") {
          const alloc = leaveAllocations.find((a: any) => a.leave_type_id === req.leave_type_id);
          if (alloc) {
            await supabase
              .from("hr_leave_allocations")
              .update({ used_days: Math.max(0, alloc.used_days - req.total_days) })
              .eq("id", alloc.id);
          }
        }
      }
    },
    onSuccess: (_, { status }) => {
      toast.success(`Leave request ${status.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["hr_leave_requests", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["hr_leave_allocations", employeeId] });
    },
    onError: () => toast.error("Failed to update leave request"),
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === leaveRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leaveRequests.map((r: any) => r.id)));
    }
  };

  // Sort requests
  const sortedRequests = [...leaveRequests].sort((a: any, b: any) => {
    if (!sortField) return 0;
    let aVal: any, bVal: any;
    switch (sortField) {
      case "leave_type":
        aVal = getLeaveType(a.leave_type_id)?.name || "";
        bVal = getLeaveType(b.leave_type_id)?.name || "";
        break;
      case "start_date": aVal = a.start_date; bVal = b.start_date; break;
      case "end_date": aVal = a.end_date; bVal = b.end_date; break;
      case "total_days": aVal = a.total_days; bVal = b.total_days; break;
      case "status": aVal = a.status; bVal = b.status; break;
      default: return 0;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const statusColors: Record<string, string> = {
    Approved: "text-green-600",
    Rejected: "text-red-600",
    Cancelled: "text-muted-foreground",
    Requested: "text-amber-600",
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        <ArrowUpDown className="h-3 w-3" />
        {label}
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* ─── Leave Allocation Cards ─── */}
      <div className="flex flex-wrap">
        {leaveAllocations.map((alloc: any) => {
          const lt = getLeaveType(alloc.leave_type_id);
          const available = alloc.allocated_days - alloc.used_days;
          const carry = alloc.carry_forward_days || 0;
          const total = alloc.allocated_days;
          return (
            <div key={alloc.id} className="min-w-[240px] border-r border-border last:border-r-0 pr-8 mr-8 last:pr-0 last:mr-0 py-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-base mb-3"
                style={{ backgroundColor: lt?.color || "#888" }}
              >
                {lt?.code || "??"}
              </div>
              <p className="text-sm font-bold text-foreground">{lt?.name || "Unknown"}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Available Leave Days</span>
                  <span className="font-semibold text-foreground">{available}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Carryforward Leave Days</span>
                  <span className="font-semibold text-foreground">{carry}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Total Leave Days</span>
                  <span className="font-semibold text-foreground">{total}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-muted-foreground">Total Leave Taken</span>
                  <span className="font-semibold text-foreground">{alloc.used_days}</span>
                </div>
              </div>
            </div>
          );
        })}
        {leaveAllocations.length === 0 && (
          <p className="text-sm text-muted-foreground py-6">No leave allocations found</p>
        )}
      </div>

      {/* ─── Leave Requests Table ─── */}
      {leaveRequests.length > 0 && (
        <div className="space-y-3">
          {/* Status legend + select count */}
          <div className="flex items-center justify-between">
            <div>
              {selectedIds.size > 0 && (
                <span className="bg-[#00bcd4] text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                  Select ({selectedIds.size})
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rejected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Cancelled
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Approved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Requested
              </span>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === leaveRequests.length && leaveRequests.length > 0}
                      onChange={toggleAll}
                      className="rounded border-border"
                    />
                  </th>
                  <SortHeader field="leave_type" label="Leave Type" />
                  <SortHeader field="start_date" label="Start Date" />
                  <SortHeader field="end_date" label="End Date" />
                  <SortHeader field="total_days" label="Requested Days" />
                  <SortHeader field="status" label="Status" />
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Options</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRequests.map((req: any) => {
                  const lt = getLeaveType(req.leave_type_id);
                  const isPending = req.status === "Requested";
                  const isCancellable = req.status === "Requested" || req.status === "Approved";

                  return (
                    <tr
                      key={req.id}
                      className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                        req.status === "Requested" ? "border-l-4 border-l-amber-400" :
                        req.status === "Approved" ? "border-l-4 border-l-green-500" :
                        req.status === "Rejected" ? "border-l-4 border-l-red-500" :
                        "border-l-4 border-l-gray-300"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(req.id)}
                          onChange={() => toggleSelect(req.id)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                            style={{ backgroundColor: lt?.color || "#888" }}
                          >
                            {lt?.code?.substring(0, 2) || "??"}
                          </span>
                          <span className="text-foreground font-medium">{lt?.name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{req.start_date}</td>
                      <td className="py-3 px-4 text-muted-foreground">{req.end_date}</td>
                      <td className="py-3 px-4 text-muted-foreground">{req.total_days}</td>
                      <td className={`py-3 px-4 font-medium ${statusColors[req.status] || "text-muted-foreground"}`}>
                        {req.status}
                      </td>
                      {/* Cancel button */}
                      <td className="py-3 px-4 text-center">
                        {isCancellable ? (
                          <button
                            onClick={() => updateStatusMutation.mutate({ requestId: req.id, status: "Cancelled" })}
                            disabled={updateStatusMutation.isPending}
                            className="bg-muted hover:bg-muted/80 text-foreground text-xs font-medium px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Approve / Reject buttons */}
                      <td className="py-3 px-4">
                        {isPending ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateStatusMutation.mutate({ requestId: req.id, status: "Approved" })}
                              disabled={updateStatusMutation.isPending}
                              className="bg-amber-400 hover:bg-amber-500 text-white px-3 py-1.5 rounded-l-lg transition-colors disabled:opacity-50"
                              title="Approve"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => updateStatusMutation.mutate({ requestId: req.id, status: "Rejected" })}
                              disabled={updateStatusMutation.isPending}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-r-lg transition-colors disabled:opacity-50"
                              title="Reject"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : req.status === "Cancelled" ? (
                          <div className="flex items-center justify-center">
                            <span className="bg-amber-400/80 text-white px-3 py-1.5 rounded-lg">
                              <Check className="h-4 w-4" />
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground text-center block">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
