import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Search, MoreVertical, Wifi, WifiOff, Clock, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DEVICE_TYPES = [
  "ZKTeco / eSSL Biometric",
  "Dahua Biometric",
  "Hikvision Biometric",
  "Anviz Biometric",
  "Other",
];

const DEVICE_DIRECTIONS = [
  "System Direction(In/Out) Device",
  "In Device",
  "Out Device",
];

const defaultForm = {
  name: "",
  device_type: "ZKTeco / eSSL Biometric",
  machine_ip: "",
  port_no: "",
  password: "0",
  device_direction: "System Direction(In/Out) Device",
  company: "",
  is_live_capture: false,
  is_scheduled: false,
};

export default function BiometricDevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["hr_biometric_devices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_biometric_devices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form };
      if (editId) {
        const { error } = await (supabase as any).from("hr_biometric_devices").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_biometric_devices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] });
      setShowDialog(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success(editId ? "Device updated" : "Device added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_biometric_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] });
      toast.success("Device deleted");
    },
  });

  const filtered = devices.filter((d: any) =>
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.machine_ip?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIndicator = (d: any) => {
    if (d.is_live_capture) return { label: "Live Capture", color: "bg-yellow-400" };
    if (d.is_scheduled) return { label: "Scheduled", color: "bg-blue-500" };
    return { label: "Not-Connected", color: "bg-red-500" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biometric Devices</h1>
          <p className="text-sm text-gray-500">Manage biometric attendance devices</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Live Capture</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Scheduled</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Not-Connected</span>
          </div>
          <Button
            onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }}
            className="bg-[#E8604C] hover:bg-[#d4553f]"
          >
            <Plus className="h-4 w-4 mr-2" /> Add
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-center py-12 text-gray-400">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-gray-400">No biometric devices found. Click "+ Add" to register one.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d: any) => {
            const status = getStatusIndicator(d);
            return (
              <Card key={d.id} className="relative">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{d.name}</h3>
                      <p className="text-xs text-gray-500">{d.device_type}</p>
                      <p className="text-xs text-gray-500">{d.device_direction}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setEditId(d.id);
                          setForm({
                            name: d.name,
                            device_type: d.device_type,
                            machine_ip: d.machine_ip || "",
                            port_no: d.port_no || "",
                            password: d.password || "0",
                            device_direction: d.device_direction,
                            company: d.company || "",
                            is_live_capture: d.is_live_capture,
                            is_scheduled: d.is_scheduled,
                          });
                          setShowDialog(true);
                        }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteMutation.mutate(d.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {d.machine_ip && (
                    <p className="text-sm text-gray-600 font-mono">{d.machine_ip}{d.port_no ? `:${d.port_no}` : ""}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={`w-2 h-2 rounded-full ${status.color}`} />
                      {status.label}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Live capture</span>
                      <Switch
                        checked={d.is_live_capture}
                        onCheckedChange={async (checked) => {
                          await (supabase as any).from("hr_biometric_devices").update({ is_live_capture: checked }).eq("id", d.id);
                          qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] });
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-xs h-7 border-teal-500 text-teal-600 hover:bg-teal-50">
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`text-xs h-7 ${d.is_scheduled ? "border-orange-400 text-orange-500 hover:bg-orange-50" : "border-teal-500 text-teal-600 hover:bg-teal-50"}`}
                      onClick={async () => {
                        await (supabase as any).from("hr_biometric_devices").update({ is_scheduled: !d.is_scheduled }).eq("id", d.id);
                        qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] });
                        toast.success(d.is_scheduled ? "Unscheduled" : "Scheduled");
                      }}
                    >
                      {d.is_scheduled ? "Unschedule" : "Schedule"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-gray-400 text-gray-600 hover:bg-gray-50">
                      Employee
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Add"} Biometric Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
            </div>
            <div>
              <Label>Device Type</Label>
              <Select value={form.device_type} onValueChange={(v) => setForm({ ...form, device_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Machine IP</Label>
                <Input value={form.machine_ip} onChange={(e) => setForm({ ...form, machine_ip: e.target.value })} placeholder="Machine Ip" />
              </div>
              <div>
                <Label>Port No</Label>
                <Input value={form.port_no} onChange={(e) => setForm({ ...form, port_no: e.target.value })} placeholder="Port No" />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Device Direction</Label>
              <Select value={form.device_direction} onValueChange={(v) => setForm({ ...form, device_direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVICE_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
