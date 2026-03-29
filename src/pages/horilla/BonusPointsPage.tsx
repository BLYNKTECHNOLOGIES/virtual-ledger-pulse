import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, Star, Trophy } from "lucide-react";

export default function BonusPointsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ employee_id: "", points: "10", reason: "" });

  const { data: points = [], isLoading } = useQuery({
    queryKey: ["hr_bonus_points"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_bonus_points")
        .select("*, hr_employees!hr_bonus_points_employee_id_fkey(badge_id, first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Select an employee");
      const { error } = await (supabase as any).from("hr_bonus_points").insert({
        employee_id: form.employee_id,
        points: parseInt(form.points) || 0,
        reason: form.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_bonus_points"] });
      setShowAdd(false);
      setForm({ employee_id: "", points: "10", reason: "" });
      toast.success("Bonus points awarded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Leaderboard
  const leaderboard = Object.values(
    points.reduce((acc: any, p: any) => {
      const emp = p.hr_employees;
      if (!emp) return acc;
      const key = p.employee_id;
      if (!acc[key]) acc[key] = { id: key, name: `${emp.first_name} ${emp.last_name}`, badge: emp.badge_id, total: 0 };
      acc[key].total += p.points;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.total - a.total) as any[];

  const filtered = points.filter((p: any) => {
    if (!search) return true;
    const name = p.hr_employees ? `${p.hr_employees.first_name} ${p.hr_employees.last_name}` : "";
    return name.toLowerCase().includes(search.toLowerCase()) || p.reason?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Star className="h-5 w-5 text-yellow-500" /> Bonus Points</h1>
          <p className="text-sm text-muted-foreground">Award and track employee recognition points</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Award Points</Button>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Trophy className="h-4 w-4 text-yellow-500" /> Leaderboard</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {leaderboard.slice(0, 10).map((e: any, i: number) => (
                <div key={e.id} className="flex flex-col items-center min-w-[80px]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-100 text-yellow-800" : i === 1 ? "bg-gray-100 text-gray-800" : i === 2 ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <span className="text-xs font-medium mt-1 text-center truncate w-full">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.total} pts</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by employee or reason..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* History Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No bonus points recorded</TableCell></TableRow>
              ) : filtered.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{format(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {p.hr_employees ? `${p.hr_employees.first_name} ${p.hr_employees.last_name} (${p.hr_employees.badge_id})` : "—"}
                  </TableCell>
                  <TableCell><span className="text-sm font-bold text-green-600">+{p.points}</span></TableCell>
                  <TableCell className="text-sm max-w-[300px] truncate">{p.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Award Bonus Points</DialogTitle>
            <DialogDescription>Recognize an employee with bonus points</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Points</Label>
              <Input type="number" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} min="1" />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} placeholder="Why are these points being awarded?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Award Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
