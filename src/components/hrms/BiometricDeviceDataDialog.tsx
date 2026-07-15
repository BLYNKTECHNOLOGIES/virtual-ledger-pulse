import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Cpu, Users, Fingerprint, ScrollText, Image as ImageIcon, Activity, Wifi, Settings2, Trash2, UserPlus, MessageSquare, Power, DoorOpen, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  device: any;
}

const PRIV = { 0: "User", 1: "Enroller", 2: "Admin", 3: "Super Admin", 14: "Custom" } as Record<number, string>;
const VERIFY = {
  0: "Group Verify", 1: "FP/Pwd/Card", 2: "FP", 3: "Pwd", 4: "Card", 5: "FP+Pwd", 6: "FP+Card",
  7: "Pwd+Card", 8: "FP+Pwd+Card", 9: "Face", 10: "Face+FP", 11: "Face+Pwd", 12: "Face+Card",
} as Record<number, string>;

function fmt(ts?: string | null) {
  if (!ts) return "—";
  try { return format(new Date(ts), "dd MMM yyyy, HH:mm"); } catch { return ts; }
}

function StatCell({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value ?? "—"}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function BiometricDeviceDataDialog({ open, onClose, device }: Props) {
  const serial = device?.device_serial;

  const infoQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-info", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_info").select("*").eq("device_serial", serial).maybeSingle()).data,
  });

  const usersQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-users", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_users").select("*").eq("device_serial", serial).order("pin")).data || [],
  });

  const tplQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-tpl", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_templates").select("*").eq("device_serial", serial).order("pin")).data || [],
  });

  const oplogQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-oplog", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_operlog").select("*").eq("device_serial", serial).order("occurred_at", { ascending: false }).limit(200)).data || [],
  });

  const punchesQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-punches", serial],
    queryFn: async () => (await (supabase as any).from("hr_attendance_punches").select("id,badge_id,punch_time,punch_type,raw_status").eq("device_serial", serial).order("punch_time", { ascending: false }).limit(200)).data || [],
  });

  const photosQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-photos", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_photos").select("id,pin,kind,size_bytes,photo_base64,punch_time,captured_at").eq("device_serial", serial).order("captured_at", { ascending: false }).limit(60)).data || [],
  });

  const queueCmd = async (cmd: string) => {
    if (!serial) return;
    const { error } = await (supabase as any).from("hr_biometric_device_commands").insert({
      device_serial: serial, command_text: cmd, status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success("Command queued — device will pick it up on next heartbeat");
  };

  const info = infoQ.data;
  const users = usersQ.data || [];
  const templates = tplQ.data || [];
  const oplog = oplogQ.data || [];
  const punches = punchesQ.data || [];
  const photos = photosQ.data || [];

  const fpTotal = templates.filter((t: any) => t.template_kind === "FP" || t.template_kind === "BIODATA").length;
  const faceTotal = templates.filter((t: any) => t.template_kind === "FACE").length;
  const palmTotal = templates.filter((t: any) => t.template_kind === "PALM").length;
  const cardTotal = users.filter((u: any) => u.card_no).length;
  const adminTotal = users.filter((u: any) => (u.privilege ?? 0) >= 2).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4" /> {device?.name}
            <span className="text-xs font-normal text-muted-foreground ml-2">SN: {serial || "—"}</span>
          </DialogTitle>
        </DialogHeader>

        {!serial ? (
          <div className="text-sm text-muted-foreground p-6">
            This device has no serial number linked. Configure the device to push to
            <code className="mx-1 px-1 py-0.5 bg-muted rounded">/biometric-webhook?SN=&lt;SERIAL&gt;</code>
            and save the same serial in the Edit dialog to unlock data capture.
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="overview"><Activity className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users ({users.length})</TabsTrigger>
              <TabsTrigger value="bio"><Fingerprint className="h-3.5 w-3.5 mr-1" />Biometrics ({templates.length})</TabsTrigger>
              <TabsTrigger value="punches"><Wifi className="h-3.5 w-3.5 mr-1" />Punches ({punches.length})</TabsTrigger>
              <TabsTrigger value="oplog"><ScrollText className="h-3.5 w-3.5 mr-1" />Operator Log ({oplog.length})</TabsTrigger>
              <TabsTrigger value="photos"><ImageIcon className="h-3.5 w-3.5 mr-1" />Photos ({photos.length})</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-hidden mt-3">
              {/* Overview */}
              <TabsContent value="overview" className="h-full m-0">
                <ScrollArea className="h-[65vh] pr-4">
                  <div className="space-y-4">
                    <Card><CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-3">Device Identity</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCell label="Serial" value={serial} />
                        <StatCell label="Firmware" value={info?.firmware} />
                        <StatCell label="Platform" value={info?.platform} />
                        <StatCell label="Device Name" value={info?.device_name} />
                        <StatCell label="OEM" value={info?.oem_vendor} />
                        <StatCell label="MAC" value={info?.mac_address} />
                        <StatCell label="IP" value={info?.ip_address || device?.machine_ip} />
                        <StatCell label="Push Version" value={info?.push_version} />
                      </div>
                    </CardContent></Card>

                    <Card><CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-3">Capacity & Counters</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCell label="Users" value={info?.user_count ?? users.length} />
                        <StatCell label="Admins" value={info?.admin_count ?? adminTotal} />
                        <StatCell label="Fingerprints" value={info?.fp_count ?? fpTotal} />
                        <StatCell label="Faces" value={info?.face_count ?? faceTotal} />
                        <StatCell label="Palms" value={info?.palm_count ?? palmTotal} />
                        <StatCell label="Cards" value={info?.card_count ?? cardTotal} />
                        <StatCell label="Passwords" value={info?.password_count} />
                        <StatCell label="Transactions" value={info?.transaction_count ?? punches.length} />
                      </div>
                    </CardContent></Card>

                    <Card><CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-3">Algorithms & Sync</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCell label="FP Algorithm" value={info?.fp_algorithm_version} />
                        <StatCell label="Face Algorithm" value={info?.face_algorithm_version} />
                        <StatCell label="Last Push" value={fmt(device?.last_sync_at)} />
                        <StatCell label="Last Stamp" value={device?.last_stamp || "0"} />
                        <StatCell label="Last Push Count" value={device?.last_push_count ?? 0} />
                        <StatCell label="Info Updated" value={fmt(info?.updated_at)} />
                      </div>
                    </CardContent></Card>

                    <Card><CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-3">Pull Fresh Data (queues iclock command)</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => queueCmd(`C:1:CHECK`)}>Ping Device</Button>
                        <Button size="sm" variant="outline" onClick={() => queueCmd(`C:2:DATA QUERY ATTLOG StartTime=2000-01-01 00:00:00\tEndTime=2100-01-01 00:00:00`)}>Re-Push Attendance</Button>
                        <Button size="sm" variant="outline" onClick={() => queueCmd(`C:3:DATA QUERY USERINFO PIN=*`)}>Re-Push Users</Button>
                        <Button size="sm" variant="outline" onClick={() => queueCmd(`C:4:INFO`)}>Refresh Device Info</Button>
                        <Button size="sm" variant="outline" onClick={() => queueCmd(`C:5:LOG`)}>Fetch Operator Log</Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Commands are picked up on the device's next heartbeat (30s interval). Use "Upload All Data → Users" on the device panel if the device firmware ignores server-side pull.
                      </div>
                    </CardContent></Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Users */}
              <TabsContent value="users" className="h-full m-0">
                <ScrollArea className="h-[65vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PIN</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Privilege</TableHead>
                        <TableHead>Verify</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-center">FP</TableHead>
                        <TableHead className="text-center">Face</TableHead>
                        <TableHead className="text-center">Palm</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No user roster received yet. On the device panel: Data Mgmt → Upload All Data → Users.</TableCell></TableRow>}
                      {users.map((u: any) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono">{u.pin}</TableCell>
                          <TableCell>{u.name || <span className="text-muted-foreground italic">(not set on device)</span>}</TableCell>
                          <TableCell>{PRIV[u.privilege ?? 0] || u.privilege}</TableCell>
                          <TableCell className="text-xs">{VERIFY[u.verify_mode ?? 0] || u.verify_mode}</TableCell>
                          <TableCell className="font-mono text-xs">{u.card_no || "—"}</TableCell>
                          <TableCell>{u.group_no ?? "—"}</TableCell>
                          <TableCell className="text-center">{u.fp_count || 0}</TableCell>
                          <TableCell className="text-center">{u.face_count || 0}</TableCell>
                          <TableCell className="text-center">{u.palm_count || 0}</TableCell>
                          <TableCell>{u.matched_employee_id ? <Badge variant="outline" className="text-xs">Linked</Badge> : <Badge variant="destructive" className="text-xs">Unlinked</Badge>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmt(u.last_seen_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Biometrics */}
              <TabsContent value="bio" className="h-full m-0">
                <ScrollArea className="h-[65vh]">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <StatCell label="Fingerprints" value={fpTotal} />
                    <StatCell label="Faces" value={faceTotal} />
                    <StatCell label="Palms" value={palmTotal} />
                    <StatCell label="Vein" value={templates.filter((t: any) => t.template_kind === "VEIN").length} />
                  </div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>PIN</TableHead><TableHead>Kind</TableHead><TableHead>Finger/Index</TableHead>
                      <TableHead>Size (B)</TableHead><TableHead>Valid</TableHead><TableHead>Duress</TableHead>
                      <TableHead>Algo</TableHead><TableHead>Captured</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {templates.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No biometric templates received.</TableCell></TableRow>}
                      {templates.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono">{t.pin}</TableCell>
                          <TableCell><Badge variant="outline">{t.template_kind}</Badge></TableCell>
                          <TableCell>{t.finger_index ?? "—"}</TableCell>
                          <TableCell>{t.size_bytes ?? "—"}</TableCell>
                          <TableCell>{t.valid ? "✓" : "✗"}</TableCell>
                          <TableCell>{t.duress ? "⚠" : "—"}</TableCell>
                          <TableCell className="text-xs">{t.algorithm_version || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmt(t.captured_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Punches */}
              <TabsContent value="punches" className="h-full m-0">
                <ScrollArea className="h-[65vh]">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Badge (PIN)</TableHead><TableHead>Time</TableHead>
                      <TableHead>Type</TableHead><TableHead>Raw Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {punches.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No punches received.</TableCell></TableRow>}
                      {punches.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono">{p.badge_id}</TableCell>
                          <TableCell>{fmt(p.punch_time)}</TableCell>
                          <TableCell><Badge variant="outline">{p.punch_type}</Badge></TableCell>
                          <TableCell className="text-xs">{p.raw_status ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Operator log */}
              <TabsContent value="oplog" className="h-full m-0">
                <ScrollArea className="h-[65vh]">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Time</TableHead><TableHead>Operation</TableHead><TableHead>Admin PIN</TableHead>
                      <TableHead>Target PIN</TableHead><TableHead>Details</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {oplog.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No operator-log entries received yet.</TableCell></TableRow>}
                      {oplog.map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs">{fmt(o.occurred_at)}</TableCell>
                          <TableCell><Badge variant="outline">{o.op_label || `OP_${o.op_code}`}</Badge></TableCell>
                          <TableCell className="font-mono">{o.admin_pin || "—"}</TableCell>
                          <TableCell className="font-mono">{o.target_pin || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{[o.value_2, o.value_3, o.value_4].filter(Boolean).join(" · ") || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Photos */}
              <TabsContent value="photos" className="h-full m-0">
                <ScrollArea className="h-[65vh]">
                  {photos.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">No photos received.</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {photos.map((p: any) => (
                        <div key={p.id} className="rounded-lg border overflow-hidden">
                          {p.photo_base64 ? (
                            <img src={`data:image/jpeg;base64,${p.photo_base64}`} alt={`PIN ${p.pin}`} className="w-full h-32 object-cover" />
                          ) : (
                            <div className="w-full h-32 bg-muted flex items-center justify-center text-xs text-muted-foreground">No image</div>
                          )}
                          <div className="p-2 text-xs">
                            <div className="font-mono">PIN {p.pin}</div>
                            <Badge variant="outline" className="text-[10px] mt-1">{p.kind}</Badge>
                            <div className="text-muted-foreground mt-1">{fmt(p.punch_time || p.captured_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
