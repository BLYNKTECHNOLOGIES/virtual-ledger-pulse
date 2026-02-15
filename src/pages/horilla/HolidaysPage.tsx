import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export default function HolidaysPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", recurring: false });

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ["hr_holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_holidays").select("*").order("date");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("hr_holidays").update(form).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_holidays").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_holidays"] });
      setShowDialog(false);
      setEditId(null);
      setForm({ name: "", date: "", recurring: false });
      toast.success(editId ? "Holiday updated" : "Holiday created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_holidays"] }); toast.success("Holiday deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const upcoming = holidays.filter((h: any) => new Date(h.date) >= new Date() && h.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Holidays</h1>
          <p className="text-sm text-gray-500">Manage company holidays and observances</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ name: "", date: "", recurring: false }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add Holiday
        </Button>
      </div>

      {upcoming.length > 0 && (
        <Card className="border-[#E8604C]/20 bg-[#E8604C]/5">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm text-[#E8604C] mb-2">🎉 Upcoming Holidays</h3>
            <div className="flex gap-3 flex-wrap">
              {upcoming.slice(0, 5).map((h: any) => (
                <div key={h.id} className="bg-white rounded-lg px-3 py-2 text-sm border">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-gray-500">{format(new Date(h.date), "MMM dd, yyyy")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Holiday", "Date", "Day", "Recurring", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : holidays.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No holidays configured</td></tr>
              ) : (
                holidays.map((h: any) => (
                  <tr key={h.id} className={`border-b hover:bg-gray-50 ${!h.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-[#E8604C]" />
                      {h.name}
                    </td>
                    <td className="px-4 py-3">{format(new Date(h.date), "MMM dd, yyyy")}</td>
                    <td className="px-4 py-3 text-gray-500">{format(new Date(h.date), "EEEE")}</td>
                    <td className="px-4 py-3">{h.recurring ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Yearly</span> : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {h.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditId(h.id); setForm({ name: h.name, date: h.date, recurring: h.recurring }); setShowDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate(h.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Holiday" : "Add Holiday"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Holiday Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Republic Day" /></div>
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} /><Label>Recurring Yearly</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.date} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
