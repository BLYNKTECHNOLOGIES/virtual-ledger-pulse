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
import { Plus, Search, MoreVertical, Pencil, Trash2, Wifi, Database, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";
import { BiometricDeviceDataDialog } from "@/components/hrms/BiometricDeviceDataDialog";

const DEVICE_TYPES = ["ZKTeco / eSSL Biometric","Dahua Biometric","Hikvision Biometric","Anviz Biometric","Other"];
const DEVICE_DIRECTIONS = ["System Direction(In/Out) Device","In Device","Out Device"];
const defaultForm = { name: "", device_type: "ZKTeco / eSSL Biometric", machine_ip: "", port_no: "", password: "0", device_direction: "System Direction(In/Out) Device", company: "", is_live_capture: false, is_scheduled: false, device_serial: "" };

export default function BiometricDevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [dataDevice, setDataDevice] = useState<any | null>(null);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["hr_biometric_devices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_biometric_devices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Silence-alarm health probe per device — shouts when punches are not landing
  // even though users exist and the device is talking.
  const { data: health = [] } = useQuery({
    queryKey: ["hr_biometric_device_health"],
    queryFn: async () => {
      const { data: users } = await (supabase as any)
        .from("hr_biometric_device_users")
        .select("device_serial, matched_employee_id");
      const { data: recent } = await (supabase as any)
        .from("hr_attendance_punches")
        .select("device_serial, punch_time")
        .gte("punch_time", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      const byDev = new Map<string, { users: number; unlinked: number; punches24h: number }>();
      for (const u of users || []) {
        const k = u.device_serial;
        if (!k) continue;
        const row = byDev.get(k) || { users: 0, unlinked: 0, punches24h: 0 };
        row.users += 1;
        if (!u.matched_employee_id) row.unlinked += 1;
        byDev.set(k, row);
      }
      for (const p of recent || []) {
        const k = p.device_serial;
        if (!k) continue;
        const row = byDev.get(k) || { users: 0, unlinked: 0, punches24h: 0 };
        row.punches24h += 1;
        byDev.set(k, row);
      }
      return Array.from(byDev.entries()).map(([serial, v]) => ({ serial, ...v }));
    },
    refetchInterval: 60_000,
  });

  const alarms = devices
    .map((d: any) => {
      const h = health.find((x: any) => x.serial === d.device_serial);
      if (!h) return null;
      const isTalking = d.is_connected && d.last_sync_at && (Date.now() - new Date(d.last_sync_at).getTime() < 6 * 3600 * 1000);
      const reasons: string[] = [];
      if (h.unlinked > 0) reasons.push(`${h.unlinked} device user${h.unlinked === 1 ? "" : "s"} not linked to any employee`);
      if ((d.unmatched_pin_count ?? 0) > 0) reasons.push(`${d.unmatched_pin_count} punch${d.unmatched_pin_count === 1 ? "" : "es"} rejected — unmapped PIN`);
      if (isTalking && h.users > 0 && h.punches24h === 0) reasons.push(`Device is online but no punches in 24 h`);
      return reasons.length ? { device: d, reasons } : null;
    })
    .filter(Boolean) as { device: any; reasons: string[] }[];

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] }); setShowDialog(false); setEditId(null); setForm(defaultForm); toast.success(editId ? "Device updated" : "Device added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_biometric_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] }); toast.success("Device deleted"); },
  });

  const filtered = devices.filter((d: any) =>
    d.name?.toLowerCase().includes(search.toLowerCase()) || d.machine_ip?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIndicator = (d: any) => {
    if (d.is_live_capture) return { label: "Live Capture", color: "bg-warning" };
    if (d.is_scheduled) return { label: "Scheduled", color: "bg-info" };
    return { label: "Not-Connected", color: "bg-destructive" };
  };

  if (dataDevice) {
    return (
      <div className="p-4 md:p-6 page-mount">
        <BiometricDeviceDataDialog open={true} onClose={() => setDataDevice(null)} device={dataDevice} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 page-mount">
      <PageHeader
        title="Biometric Devices"
        description="Manage biometric attendance devices"
        actions={
          <>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> Live Capture</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-info" /> Scheduled</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /> Not-Connected</span>
            </div>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search devices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Wifi} title="No biometric devices found" description="Register a device to start collecting attendance data." action={<Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => { setEditId(null); setForm(defaultForm); setShowDialog(true); }}><Plus className="h-4 w-4 mr-2" /> Add Device</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d: any) => {
            const status = getStatusIndicator(d);
            return (
              <Card key={d.id} className="relative">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{d.name}</h3>
                      <p className="text-xs text-muted-foreground">{d.device_type}</p>
                      <p className="text-xs text-muted-foreground">{d.device_direction}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditId(d.id); setForm({ name: d.name, device_type: d.device_type, machine_ip: d.machine_ip || "", port_no: d.port_no || "", password: d.password || "0", device_direction: d.device_direction, company: d.company || "", is_live_capture: d.is_live_capture, is_scheduled: d.is_scheduled, device_serial: d.device_serial || "" }); setShowDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(d.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {d.machine_ip && <p className="text-sm text-muted-foreground font-mono">{d.machine_ip}{d.port_no ? `:${d.port_no}` : ""}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`w-2 h-2 rounded-full ${status.color}`} />{status.label}</div>
                    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Live capture</span><Switch checked={d.is_live_capture} onCheckedChange={async (checked) => { await (supabase as any).from("hr_biometric_devices").update({ is_live_capture: checked }).eq("id", d.id); qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] }); }} /></div>
                  </div>
                  <div className="flex gap-2 pt-1 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-7 border-primary text-primary hover:bg-primary/10" onClick={() => setDataDevice(d)}><Database className="h-3.5 w-3.5 mr-1" />View Data</Button>
                    <Button size="sm" variant="outline" className={`text-xs h-7 ${d.is_scheduled ? "border-warning text-warning hover:bg-warning/10" : "border-info text-info hover:bg-info/10"}`} onClick={async () => { await (supabase as any).from("hr_biometric_devices").update({ is_scheduled: !d.is_scheduled }).eq("id", d.id); qc.invalidateQueries({ queryKey: ["hr_biometric_devices"] }); toast.success(d.is_scheduled ? "Unscheduled" : "Scheduled"); }}>{d.is_scheduled ? "Unschedule" : "Schedule"}</Button>
                    {d.device_serial && <span className="text-[10px] text-muted-foreground font-mono self-center">SN {d.device_serial}</span>}
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm font-semibold flex items-center gap-2"><Wifi className="h-4 w-4" />{editId ? "Edit" : "Add"} Biometric Device</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input className="h-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" /></div>
            <div><Label>Device Type</Label><Select value={form.device_type} onValueChange={(v) => setForm({ ...form, device_type: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Machine IP</Label><Input className="h-9" value={form.machine_ip} onChange={(e) => setForm({ ...form, machine_ip: e.target.value })} placeholder="Machine Ip" /></div>
              <div><Label>Port No</Label><Input className="h-9" value={form.port_no} onChange={(e) => setForm({ ...form, port_no: e.target.value })} placeholder="Port No" /></div>
            </div>
            <div><Label>Password</Label><Input className="h-9" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="0" /></div>
            <div><Label>Device Direction</Label><Select value={form.device_direction} onValueChange={(v) => setForm({ ...form, device_direction: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{DEVICE_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Company</Label><Input className="h-9" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" /></div>
            <div><Label>Device Serial (SN) <span className="text-muted-foreground text-xs">— required for iclock push</span></Label><Input className="h-9 font-mono" value={form.device_serial} onChange={(e) => setForm({ ...form, device_serial: e.target.value.trim() })} placeholder="e.g. CJXK202160002" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button className="h-9 bg-[#E8604C] hover:bg-[#d4553f]" onClick={() => saveMutation.mutate()} disabled={!form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
