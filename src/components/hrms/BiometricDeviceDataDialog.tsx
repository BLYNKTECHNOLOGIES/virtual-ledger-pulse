import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
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

  // Parked (unreplayed) quarantine punches per PIN for this device — surfaces the
  // recoverable-punch count next to unlinked users so HR sees the payoff before mapping.
  const quarantineQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-quarantine-by-pin", serial],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_attendance_quarantine")
        .select("pin")
        .eq("device_serial", serial)
        .is("replayed_at", null);
      const map = new Map<string, number>();
      for (const r of data || []) map.set(String(r.pin), (map.get(String(r.pin)) || 0) + 1);
      return map;
    },
  });

  // Active employees for the Link picker.
  const employeesQ = useQuery({
    enabled: open,
    queryKey: ["bio-link-employees"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true)
        .order("first_name");
      return data || [];
    },
  });


  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [linkPin, setLinkPin] = useState<string | null>(null);
  const [linkEmployeeId, setLinkEmployeeId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  // Map a device PIN to an HRMS employee. The DB trigger `hr_replay_quarantine_on_mapping`
  // drains parked punches, rebuilds hr_attendance + hr_attendance_daily, and queues a
  // 30-day ATTLOG re-fetch. We snapshot parked-count before/after to report drainage.
  const linkPinToEmployee = async () => {
    if (!serial || !linkPin || !linkEmployeeId) return;
    setLinking(true);
    const parkedBefore = quarantineQ.data?.get(String(linkPin)) ?? 0;
    const { error } = await (supabase as any)
      .from("hr_biometric_device_users")
      .update({ matched_employee_id: linkEmployeeId })
      .eq("device_serial", serial)
      .eq("pin", linkPin);
    if (error) { setLinking(false); toast.error(error.message); return; }
    const { data: postRows } = await (supabase as any)
      .from("hr_attendance_quarantine")
      .select("id")
      .eq("device_serial", serial)
      .eq("pin", linkPin)
      .is("replayed_at", null);
    const parkedAfter = (postRows || []).length;
    const drained = Math.max(0, parkedBefore - parkedAfter);
    setLinking(false);
    setLinkPin(null);
    setLinkEmployeeId("");
    await Promise.all([usersQ.refetch(), quarantineQ.refetch(), punchesQ.refetch()]);
    qc.invalidateQueries({ queryKey: ["hr_attendance_quarantine_banner"] });
    qc.invalidateQueries({ queryKey: ["hr_attendance"] });
    qc.invalidateQueries({ queryKey: ["hr_attendance_daily"] });
    if (drained > 0) {
      toast.success(`PIN ${linkPin} linked. Replayed ${drained} parked punch${drained === 1 ? "" : "es"} into attendance; daily rollups rebuilt. A 30-day ATTLOG re-fetch is queued to the device.`);
    } else if (parkedBefore === 0) {
      toast.success(`PIN ${linkPin} linked. No parked punches to replay; future punches will land clean.`);
    } else {
      toast.warning(`PIN ${linkPin} linked, but ${parkedAfter} punch${parkedAfter === 1 ? "" : "es"} remain parked — check hr_replay_quarantine_on_mapping logs.`);
    }
  };


  const cmdsQ = useQuery({
    enabled: !!serial && open,
    queryKey: ["bio-cmds", serial],
    queryFn: async () => (await (supabase as any).from("hr_biometric_device_commands").select("*").eq("device_serial", serial).order("created_at", { ascending: false }).limit(40)).data || [],
  });

  const queueCmd = async (cmd: string, successMsg = "Command queued — device will pick it up on next heartbeat"): Promise<string | null> => {
    if (!serial) return null;
    setBusy(true);
    const { data, error } = await (supabase as any)
      .from("hr_biometric_device_commands")
      .insert({ device_serial: serial, command_text: cmd, status: "pending" })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return null; }
    toast.success(successMsg);
    qc.invalidateQueries({ queryKey: ["bio-cmds", serial] });
    return data?.id ?? null;
  };

  // Poll a queued command until the device acks/errors or the timeout elapses.
  // Devices poll every 10–30s via ?type=getrequest; give it ~90s.
  const awaitCommandAck = async (commandId: string, timeoutMs = 90_000): Promise<"ack" | "error" | "timeout" | "sent"> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await (supabase as any)
        .from("hr_biometric_device_commands")
        .select("status")
        .eq("id", commandId)
        .maybeSingle();
      const s = data?.status;
      if (s === "ack" || s === "error") return s;
      await new Promise((r) => setTimeout(r, 2500));
    }
    // Was it at least delivered?
    const { data } = await (supabase as any)
      .from("hr_biometric_device_commands")
      .select("status")
      .eq("id", commandId)
      .maybeSingle();
    return data?.status === "sent" ? "sent" : "timeout";
  };

  // eSSL/ZKTeco iclock write commands — device-side only, unrelated to HRMS
  const escape = (v: string) => String(v ?? "").replace(/\t/g, " ").replace(/\n/g, " ");
  const upsertUser = (p: { pin: string; name: string; privilege: number; password?: string; card?: string; group?: string }) => {
    const parts = [
      `PIN=${escape(p.pin)}`,
      `Name=${escape(p.name)}`,
      `Pri=${p.privilege ?? 0}`,
      p.password ? `Passwd=${escape(p.password)}` : "",
      p.card ? `Card=${escape(p.card)}` : "",
      p.group ? `Grp=${escape(p.group)}` : "1",
    ].filter(Boolean).join("\t");
    return queueCmd(`C:${Date.now()}:DATA UPDATE USERINFO ${parts}`, `User ${p.pin} queued for push`);
  };

  const refetchDeviceData = async () => {
    await Promise.all([
      usersQ.refetch(),
      tplQ.refetch(),
      photosQ.refetch(),
      cmdsQ.refetch(),
    ]);
  };

  const cleanupConfirmedDelete = async (pin: string, commandId: string) => {
    const { data, error } = await (supabase as any).rpc("cleanup_biometric_device_pin_after_ack", {
      _device_serial: serial,
      _pin: pin,
      _command_id: commandId,
    });

    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.message || "Device delete is not acknowledged yet");

    qc.setQueryData(["bio-users", serial], (old: any[] = []) => old.filter((u: any) => String(u.pin) !== String(pin)));
    qc.setQueryData(["bio-tpl", serial], (old: any[] = []) => old.filter((t: any) => String(t.pin) !== String(pin)));
    qc.setQueryData(["bio-photos", serial], (old: any[] = []) => old.filter((p: any) => String(p.pin) !== String(pin)));
    await refetchDeviceData();
    return data;
  };

  const deleteUser = async (pin: string) => {
    if (!serial) return;
    const commandId = await queueCmd(
      `C:${Date.now()}:DATA DELETE USERINFO PIN=${escape(pin)}`,
      `Delete user ${pin} queued — waiting for device confirmation…`,
    );
    if (!commandId) return;

    const toastId = toast.loading(`Waiting for device to confirm delete of PIN ${pin}…`);
    const outcome = await awaitCommandAck(commandId);
    await cmdsQ.refetch();

    if (outcome === "ack") {
      try {
        const cleaned = await cleanupConfirmedDelete(pin, commandId);
        toast.success(
          `PIN ${pin} deleted from eSSL and removed from ERP roster (${cleaned?.users_deleted ?? 0} user row, ${cleaned?.templates_deleted ?? 0} templates).`,
          { id: toastId },
        );
      } catch (e: any) {
        await refetchDeviceData();
        toast.error(`eSSL acknowledged delete, but ERP cleanup failed: ${e?.message || "Unknown error"}`, { id: toastId });
      }
    } else if (outcome === "error") {
      toast.error(`Device rejected delete of PIN ${pin}. Check operator log for the reason.`, { id: toastId });
    } else if (outcome === "sent") {
      await refetchDeviceData();
      toast.warning(`Delete for PIN ${pin} was delivered to eSSL but not acknowledged yet. The ERP roster will clear only after ACK is received.`, { id: toastId });
    } else {
      await refetchDeviceData();
      toast.error(`Device did not pick up the delete command for PIN ${pin}. Confirm the device is online (heartbeat) and try again.`, { id: toastId });
    }
  };
  const clearAll = (target: "DATA" | "LOG" | "PHOTO") =>
    queueCmd(`C:${Date.now()}:CLEAR ${target}`, `CLEAR ${target} queued`);
  const reboot = () => queueCmd(`C:${Date.now()}:REBOOT`, "Reboot queued");
  const unlockDoor = () => queueCmd(`C:${Date.now()}:AC_UNLOCK`, "Door unlock queued");
  const pushMessage = (pin: string, text: string, minutes = 60) => {
    const smsId = Math.floor(Date.now() / 1000) % 2147483647;
    const start = format(new Date(), "yyyy-MM-dd HH:mm:ss");
    return queueCmd(
      `C:${Date.now()}:DATA UPDATE SMS MSG=${smsId}\tTAG=1\tUID=${smsId}\tMIN=${minutes}\tStartTime=${start}\tContent=${escape(text)}` +
      (pin ? `\nC:${Date.now() + 1}:DATA UPDATE USER_SMS PIN=${escape(pin)}\tMSG=${smsId}` : ""),
      pin ? `Message pushed to PIN ${pin}` : `Broadcast message queued`
    );
  };
  const setOption = (key: string, value: string) =>
    queueCmd(`C:${Date.now()}:SET OPTION ${escape(key)}=${escape(value)}`, `Option ${key}=${value} queued`);

  const info = infoQ.data;
  const users = usersQ.data || [];
  const templates = tplQ.data || [];
  const oplog = oplogQ.data || [];
  const punches = punchesQ.data || [];
  const photos = photosQ.data || [];
  const cmds = cmdsQ.data || [];

  const fpTotal = templates.filter((t: any) => t.template_kind === "FP" || t.template_kind === "BIODATA").length;
  const faceTotal = templates.filter((t: any) => t.template_kind === "FACE").length;
  const palmTotal = templates.filter((t: any) => t.template_kind === "PALM").length;
  const cardTotal = users.filter((u: any) => u.card_no).length;
  const adminTotal = users.filter((u: any) => (u.privilege ?? 0) >= 2).length;

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3 border-b pb-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          <span className="font-semibold text-foreground">{device?.name}</span>
          <span className="text-xs font-normal text-muted-foreground ml-2">SN: {serial || "—"}</span>
        </div>
      </div>

        {!serial ? (
          <div className="text-sm text-muted-foreground p-6">
            This device has no serial number linked. Configure the device to push to
            <code className="mx-1 px-1 py-0.5 bg-muted rounded">/biometric-webhook?SN=&lt;SERIAL&gt;</code>
            and save the same serial in the Edit dialog to unlock data capture.
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="grid grid-cols-7 w-full">
              <TabsTrigger value="overview"><Activity className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1" />Users ({users.length})</TabsTrigger>
              <TabsTrigger value="bio"><Fingerprint className="h-3.5 w-3.5 mr-1" />Biometrics ({templates.length})</TabsTrigger>
              <TabsTrigger value="punches"><Wifi className="h-3.5 w-3.5 mr-1" />Punches ({punches.length})</TabsTrigger>
              <TabsTrigger value="oplog"><ScrollText className="h-3.5 w-3.5 mr-1" />Operator Log ({oplog.length})</TabsTrigger>
              <TabsTrigger value="photos"><ImageIcon className="h-3.5 w-3.5 mr-1" />Photos ({photos.length})</TabsTrigger>
              <TabsTrigger value="manage"><Settings2 className="h-3.5 w-3.5 mr-1" />Manage</TabsTrigger>
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
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No user roster received yet. On the device panel: Data Mgmt → Upload All Data → Users.</TableCell></TableRow>}
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
                          <TableCell>
                            {u.matched_employee_id ? (
                              <Badge variant="outline" className="text-xs">Linked</Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive" className="text-xs">Unlinked</Badge>
                                {(() => {
                                  const parked = quarantineQ.data?.get(String(u.pin)) ?? 0;
                                  return parked > 0 ? (
                                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400" title="Parked punches waiting to be replayed once this PIN is mapped">
                                      {parked} parked
                                    </span>
                                  ) : null;
                                })()}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => { setLinkPin(String(u.pin)); setLinkEmployeeId(""); }}
                                >
                                  Link
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmt(u.last_seen_at)}</TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete user from device?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This queues a <code>DATA DELETE USERINFO PIN={u.pin}</code> command on the device. Fingerprint/face/card templates for this PIN will also be removed on the device. This does NOT affect HRMS employee records.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteUser(u.pin)} className="bg-destructive text-destructive-foreground">Delete on device</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
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

              {/* Manage — device-side write actions, decoupled from HRMS */}
              <TabsContent value="manage" className="h-full m-0">
                <ScrollArea className="h-[65vh] pr-4">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                      <AlertTriangle className="h-4 w-4 flex-none mt-0.5" />
                      <div>
                        These actions modify the eSSL device roster/state directly. They are <b>independent of HRMS</b> — device names, cards and PINs on the device are informational only. HRMS attendance mapping is driven solely by <b>Badge ID (PIN) → Employee</b>.
                      </div>
                    </div>

                    <ManageUserCard onSubmit={upsertUser} busy={busy} />
                    <BroadcastCard onSubmit={pushMessage} busy={busy} users={users} />
                    <DeviceOptionCard onSubmit={setOption} busy={busy} />

                    <Card><CardContent className="p-4 space-y-3">
                      <div className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Danger Zone</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <DangerAction label="Clear all attendance logs" desc="Wipes ATTLOG on device. Punches already synced to HRMS are safe." confirm="CLEAR LOG" onConfirm={() => clearAll("LOG")} disabled={busy} />
                        <DangerAction label="Clear all photos" desc="Wipes captured photos on device (attendance snapshots + avatars)." confirm="CLEAR PHOTO" onConfirm={() => clearAll("PHOTO")} disabled={busy} />
                        <DangerAction label="Clear ALL device data" desc="Wipes users, templates, logs — full factory-like reset of storage." confirm="CLEAR DATA" onConfirm={() => clearAll("DATA")} disabled={busy} destructive />
                        <DangerAction label="Reboot device" icon={<Power className="h-3.5 w-3.5" />} desc="Sends REBOOT command. Device will be offline for ~60s." confirm="REBOOT" onConfirm={reboot} disabled={busy} />
                        <DangerAction label="Unlock door (AC)" icon={<DoorOpen className="h-3.5 w-3.5" />} desc="Triggers remote door unlock via access-control relay (if wired)." confirm="AC_UNLOCK" onConfirm={unlockDoor} disabled={busy} />
                      </div>
                    </CardContent></Card>

                    <Card><CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground mb-3">Recent Commands ({cmds.length})</div>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Time</TableHead><TableHead>Status</TableHead><TableHead>Command</TableHead><TableHead>Response</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {cmds.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No commands yet.</TableCell></TableRow>}
                          {cmds.map((c: any) => (
                            <TableRow key={c.id}>
                              <TableCell className="text-xs">{fmt(c.created_at)}</TableCell>
                              <TableCell>
                                <Badge variant={c.status === "ack" ? "default" : c.status === "sent" ? "outline" : c.status === "pending" ? "secondary" : "destructive"} className="text-[10px]">
                                  {c.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-[11px] max-w-[380px] truncate" title={c.command_text}>{c.command_text}</TableCell>
                              <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={c.ack_response || ""}>{c.ack_response || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent></Card>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        )}
    </div>
  );
}

// --- Manage subcomponents ---

function ManageUserCard({ onSubmit, busy }: { onSubmit: (p: any) => Promise<any>; busy: boolean }) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [privilege, setPrivilege] = useState("0");
  const [password, setPassword] = useState("");
  const [card, setCard] = useState("");
  const [group, setGroup] = useState("1");

  const submit = async () => {
    if (!pin.trim()) return toast.error("PIN (Badge ID) is required");
    await onSubmit({ pin: pin.trim(), name: name.trim(), privilege: Number(privilege), password, card, group });
    setPin(""); setName(""); setPassword(""); setCard("");
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" />Create / Update User on Device</div>
      <div className="text-[11px] text-muted-foreground -mt-2">
        Uses <code>DATA UPDATE USERINFO</code>. If PIN already exists on the device it will be updated. Name/card on device are cosmetic — HRMS links via <b>PIN → Badge ID</b> only.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div><Label className="text-xs">PIN (Badge ID) *</Label><Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="e.g. 1042" /></div>
        <div><Label className="text-xs">Name (on device)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" /></div>
        <div>
          <Label className="text-xs">Privilege</Label>
          <Select value={privilege} onValueChange={setPrivilege}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">User</SelectItem>
              <SelectItem value="1">Enroller</SelectItem>
              <SelectItem value="2">Admin</SelectItem>
              <SelectItem value="3">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Optional" /></div>
        <div><Label className="text-xs">Card No</Label><Input value={card} onChange={(e) => setCard(e.target.value)} placeholder="RFID / MIFARE" /></div>
        <div><Label className="text-xs">Group</Label><Input value={group} onChange={(e) => setGroup(e.target.value)} /></div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={busy}>Queue push to device</Button>
      </div>
    </CardContent></Card>
  );
}

function BroadcastCard({ onSubmit, busy, users }: { onSubmit: (pin: string, text: string, min?: number) => Promise<any>; busy: boolean; users: any[] }) {
  const [pin, setPin] = useState("");
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("60");

  const submit = async () => {
    if (!text.trim()) return toast.error("Message text is required");
    await onSubmit(pin.trim(), text.trim(), Number(minutes) || 60);
    setText("");
  };

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Push Message to Device Display</div>
      <div className="text-[11px] text-muted-foreground -mt-2">
        Personal message (PIN set) shows after that user verifies. Leave PIN empty for a broadcast to all users.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Target PIN (blank = broadcast)</Label><Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="e.g. 1042" list="bio-pins" /><datalist id="bio-pins">{users.map((u: any) => <option key={u.pin} value={u.pin}>{u.name}</option>)}</datalist></div>
        <div className="md:col-span-2"><Label className="text-xs">Message</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Message to display on the device screen" /></div>
        <div><Label className="text-xs">Show for (minutes)</Label><Input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={busy}>Queue message</Button>
      </div>
    </CardContent></Card>
  );
}

function DeviceOptionCard({ onSubmit, busy }: { onSubmit: (k: string, v: string) => Promise<any>; busy: boolean }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const presets = [
    { k: "VerifyMode", v: "1", label: "Verify: FP / Pwd / Card" },
    { k: "VerifyMode", v: "9", label: "Verify: Face" },
    { k: "IsSupportBioPhoto", v: "1", label: "Enable attendance photo capture" },
    { k: "AttPhotoUpload", v: "1", label: "Upload attendance photos to server" },
  ];
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" />Device Option / Setting</div>
      <div className="text-[11px] text-muted-foreground -mt-2">
        Sends <code>SET OPTION key=value</code>. Refer to your device firmware option keys.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Button key={p.label} size="sm" variant="outline" className="text-[11px] h-7" disabled={busy} onClick={() => onSubmit(p.k, p.v)}>{p.label}</Button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Option key</Label><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. VerifyMode" /></div>
        <div><Label className="text-xs">Value</Label><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 1" /></div>
        <div className="flex items-end"><Button size="sm" onClick={() => key && value && onSubmit(key, value)} disabled={busy || !key || !value}>Queue option</Button></div>
      </div>
    </CardContent></Card>
  );
}

function DangerAction({ label, desc, confirm, onConfirm, disabled, destructive, icon }: { label: string; desc: string; confirm: string; onConfirm: () => void; disabled?: boolean; destructive?: boolean; icon?: React.ReactNode }) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? "destructive" : "outline"} size="sm" disabled={disabled} className="justify-start">
          {icon || <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
          <span className="text-xs">{label}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>
            {desc}<br /><br />
            Type <code className="font-mono px-1 py-0.5 bg-muted rounded">{confirm}</code> to confirm:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirm} className="font-mono" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={typed !== confirm}
            className={destructive ? "bg-destructive text-destructive-foreground" : ""}
            onClick={() => { onConfirm(); setOpen(false); }}
          >
            Queue on device
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
