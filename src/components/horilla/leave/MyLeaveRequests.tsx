
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Plus } from "lucide-react";
import { useLeaveAllocations, useLeaveRequests } from "./useLeaveData";

interface MyLeaveRequestsProps {
  onCreateRequest: () => void;
}

export function MyLeaveRequests({ onCreateRequest }: MyLeaveRequestsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: allocations = [] } = useLeaveAllocations();
  const { data: requests = [] } = useLeaveRequests();

  // Build leave type summary cards
  const typeMap: Record<string, { name: string; code: string; color: string; available: number; carryForward: number; total: number; taken: number }> = {};

  allocations.forEach((a: any) => {
    const lt = a.hr_leave_types;
    if (!lt) return;
    if (!typeMap[lt.id]) {
      typeMap[lt.id] = {
        name: lt.name,
        code: lt.code,
        color: lt.color || "#009C4A",
        available: 0,
        carryForward: 0,
        total: 0,
        taken: 0,
      };
    }
    typeMap[lt.id].available += (a.allocated_days || 0) - (a.used_days || 0);
    typeMap[lt.id].carryForward += a.carry_forward_days || 0;
    typeMap[lt.id].total += a.allocated_days || 0;
    typeMap[lt.id].taken += a.used_days || 0;
  });

  const cards = Object.values(typeMap).filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Status legend counts
  const statusCounts = {
    rejected: requests.filter((r: any) => r.status === "rejected").length,
    requested: requests.filter((r: any) => r.status === "requested").length,
    approved: requests.filter((r: any) => r.status === "approved").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">My Leave Requests</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" /> Filter</Button>
          <Button variant="outline" size="sm">Actions</Button>
          <Button className="bg-[#009C4A] hover:bg-[#008040] text-white" size="sm" onClick={onCreateRequest}>
            <Plus className="h-4 w-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      {/* Select count + status legend */}
      <div className="flex items-center justify-between">
        <Badge className="bg-[#009C4A] text-white">Select ({cards.length})</Badge>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rejected</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Requested</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Approved</span>
        </div>
      </div>

      {/* Leave Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.length === 0 ? (
          <div className="col-span-4 text-center py-12 text-gray-400">No leave allocations found</div>
        ) : (
          cards.map((card) => (
            <Card key={card.code} className="border-t-4" style={{ borderTopColor: card.color }}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: card.color }}
                  >
                    {card.code}
                  </div>
                  <h3 className="font-semibold text-gray-800">{card.name}</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Available Leave Days</span>
                    <span className="font-medium">{card.available}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Carryforward Leave Days</span>
                    <span className="font-medium">{card.carryForward}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Leave Days</span>
                    <span className="font-medium">{card.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Leave Taken</span>
                    <span className="font-medium">{card.taken}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
