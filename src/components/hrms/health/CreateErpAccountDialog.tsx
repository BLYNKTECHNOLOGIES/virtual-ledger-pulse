import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type CreateErpTarget = {
  hr_employee_id: string | null;
  emp_full_name: string | null;
  emp_badge_id: string | null;
  email: string | null;
  phone: string | null;
};

const BLOCKED_ROLES = ["admin", "super admin", "super_admin"];

export function CreateErpAccountDialog({
  target,
  onOpenChange,
  onCreated,
}: {
  target: CreateErpTarget | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [roleId, setRoleId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendMail, setSendMail] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setEmail((target.email || "").trim());
      setPhone((target.phone || "").trim());
      setRoleId("");
      setSendMail(true);
    }
  }, [target]);

  const { data: roles } = useQuery({
    queryKey: ["erp_roles_for_create"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("roles")
        .select("id, name, hierarchy_level")
        .order("hierarchy_level");
      if (error) throw error;
      return (data ?? []).filter(
        (r: any) => !BLOCKED_ROLES.includes(String(r.name || "").trim().toLowerCase()),
      ) as Array<{ id: string; name: string; hierarchy_level: number }>;
    },
    staleTime: 300_000,
  });

  async function submit() {
    if (!target) return;
    const parts = (target.emp_full_name || "").trim().split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ");
    if (!firstName) return toast.error("Employee name is missing in HRMS");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("A valid email is required");
    if (!roleId) return toast.error("Select a role for this ERP account");

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-erp-user", {
        body: {
          firstName,
          lastName,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          roleId,
          badgeId: target.emp_badge_id || null,
        },
      });
      if (error) throw new Error((await (error as any)?.context?.text?.()) || error.message);
      if ((data as any)?.error) throw new Error(String((data as any).error));

      const username = (data as any)?.username as string | undefined;
      const tempPassword = (data as any)?.tempPassword as string | null | undefined;

      if ((data as any)?.alreadyExists) {
        toast.success(`Existing ERP login "${username}" linked and updated`);
      } else {
        toast.success(`ERP account created — username ${username}`);
      }

      if (sendMail && tempPassword && username) {
        const roleName = roles?.find((r) => r.id === roleId)?.name || "";
        const { data: mailRes, error: mailErr } = await supabase.functions.invoke(
          "hr-send-erp-credentials",
          {
            body: {
              email: email.trim().toLowerCase(),
              fullName: target.emp_full_name,
              username,
              tempPassword,
              roleName,
            },
          },
        );
        if (mailErr || (mailRes as any)?.error) {
          toast.error(
            `Account created, but the credentials email failed: ${
              (mailRes as any)?.error || mailErr?.message
            }. Temp password: ${tempPassword}`,
            { duration: 20000 },
          );
        } else {
          toast.success(`Credentials emailed to ${email.trim()}`);
        }
      } else if (tempPassword) {
        toast.message(`Temporary password: ${tempPassword}`, { duration: 20000 });
      }

      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Could not create the ERP account: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create ERP account</DialogTitle>
          <DialogDescription>
            {target?.emp_full_name}
            {target?.emp_badge_id ? ` · Badge ${target.emp_badge_id}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="erp-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="erp-role" className="text-foreground">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(roles ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Admin and Super Admin cannot be assigned here.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="erp-email">Login email</Label>
            <Input
              id="erp-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-foreground"
              type="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="erp-phone">Phone</Label>
            <Input
              id="erp-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-foreground"
            />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border p-2.5 text-xs">
            <Checkbox checked={sendMail} onCheckedChange={(v) => setSendMail(!!v)} className="mt-0.5" />
            <span className="text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Mail className="h-3.5 w-3.5" /> Email the credentials
              </span>
              Sends the login email, username and temporary password to the employee. A password change is
              forced on first login.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Create ERP ID
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
