import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Briefcase, MapPin } from "lucide-react";

export default function OrganizationPage() {
  const { data: departments = [] } = useQuery({
    queryKey: ["org_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["org_positions"],
    queryFn: async () => {
      const { data } = await supabase.from("positions").select("*").eq("is_active", true).order("title");
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["org_employees"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, is_active");
      return data || [];
    },
  });

  const { data: workInfos = [] } = useQuery({
    queryKey: ["org_work_infos"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id, location");
      return data || [];
    },
  });

  const deptCounts: Record<string, number> = {};
  workInfos.forEach((w: any) => { if (w.department_id) deptCounts[w.department_id] = (deptCounts[w.department_id] || 0) + 1; });

  const locations = new Set(workInfos.map((w: any) => w.location).filter(Boolean));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Organization</h1><p className="text-sm text-gray-500">Company structure and overview</p></div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Departments", value: departments.length, icon: Building2, bg: "bg-violet-50", color: "text-violet-600" },
          { label: "Positions", value: positions.length, icon: Briefcase, bg: "bg-blue-50", color: "text-blue-600" },
          { label: "Employees", value: employees.length, icon: Users, bg: "bg-emerald-50", color: "text-emerald-600" },
          { label: "Locations", value: locations.size, icon: MapPin, bg: "bg-amber-50", color: "text-amber-600" },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3"><div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div><div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle className="text-sm">Departments</CardTitle></CardHeader><CardContent className="p-0">
        <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr>{["Department", "Code", "Employees", "Level"].map(h => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}</tr></thead>
        <tbody>{departments.map((d: any) => (
          <tr key={d.id} className="border-b hover:bg-gray-50">
            <td className="px-4 py-3 font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-[#E8604C]" />{d.name}</td>
            <td className="px-4 py-3"><span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{d.code}</span></td>
            <td className="px-4 py-3">{deptCounts[d.id] || 0}</td>
            <td className="px-4 py-3 text-gray-500">{d.hierarchy_level || "—"}</td>
          </tr>
        ))}</tbody></table>
      </CardContent></Card>
    </div>
  );
}
