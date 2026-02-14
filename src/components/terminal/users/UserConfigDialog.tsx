import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Settings2, ArrowUpRight, Briefcase, Clock, Zap, Building2, Ruler } from "lucide-react";

interface UserProfile {
  user_id: string;
  reports_to: string | null;
  specialization: string;
  shift: string | null;
  is_active: boolean;
  automation_included: boolean;
}

interface ExchangeAccount {
  id: string;
  account_name: string;
}

interface SizeRange {
  id: string;
  name: string;
  min_amount: number;
  max_amount: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  displayName: string;
  onSaved: () => void;
}

export function UserConfigDialog({ open, onOpenChange, userId, username, displayName, onSaved }: Props) {
  const [profile, setProfile] = useState<UserProfile>({
    user_id: userId,
    reports_to: null,
    specialization: "both",
    shift: null,
    is_active: true,
    automation_included: true,
  });
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null }[]>([]);
  const [exchangeAccounts, setExchangeAccounts] = useState<ExchangeAccount[]>([]);
  const [sizeRanges, setSizeRanges] = useState<SizeRange[]>([]);
  const [selectedExchanges, setSelectedExchanges] = useState<Set<string>>(new Set());
  const [selectedSizeRanges, setSelectedSizeRanges] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [profileRes, usersRes, exchangeRes, sizeRes, exchMapRes, sizeMapRes] = await Promise.all([
        supabase.from("terminal_user_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("users").select("id, username, first_name, last_name").eq("status", "ACTIVE"),
        supabase.from("terminal_exchange_accounts").select("id, account_name").eq("is_active", true),
        supabase.from("terminal_order_size_ranges").select("id, name, min_amount, max_amount").eq("is_active", true),
        supabase.from("terminal_user_exchange_mappings").select("exchange_account_id").eq("user_id", userId),
        supabase.from("terminal_user_size_range_mappings").select("size_range_id").eq("user_id", userId),
      ]);

      if (profileRes.data) {
        setProfile({
          user_id: userId,
          reports_to: profileRes.data.reports_to,
          specialization: profileRes.data.specialization,
          shift: profileRes.data.shift,
          is_active: profileRes.data.is_active,
          automation_included: profileRes.data.automation_included,
        });
      }

      setAllUsers((usersRes.data || []).filter(u => u.id !== userId));
      setExchangeAccounts(exchangeRes.data || []);
      setSizeRanges(sizeRes.data || []);
      setSelectedExchanges(new Set((exchMapRes.data || []).map(m => m.exchange_account_id)));
      setSelectedSizeRanges(new Set((sizeMapRes.data || []).map(m => m.size_range_id)));
    } catch (err) {
      console.error("Error fetching user config:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Upsert profile
      const { error: profileErr } = await supabase
        .from("terminal_user_profiles")
        .upsert({
          user_id: userId,
          reports_to: profile.reports_to || null,
          specialization: profile.specialization,
          shift: profile.shift || null,
          is_active: profile.is_active,
          automation_included: profile.automation_included,
        }, { onConflict: "user_id" });

      if (profileErr) throw profileErr;

      // Sync exchange mappings
      await supabase.from("terminal_user_exchange_mappings").delete().eq("user_id", userId);
      if (selectedExchanges.size > 0) {
        const rows = Array.from(selectedExchanges).map(eid => ({
          user_id: userId,
          exchange_account_id: eid,
        }));
        const { error: exchErr } = await supabase.from("terminal_user_exchange_mappings").insert(rows);
        if (exchErr) throw exchErr;
      }

      // Sync size range mappings
      await supabase.from("terminal_user_size_range_mappings").delete().eq("user_id", userId);
      if (selectedSizeRanges.size > 0) {
        const rows = Array.from(selectedSizeRanges).map(sid => ({
          user_id: userId,
          size_range_id: sid,
        }));
        const { error: sizeErr } = await supabase.from("terminal_user_size_range_mappings").insert(rows);
        if (sizeErr) throw sizeErr;
      }

      toast.success("User configuration saved");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving user config:", err);
      toast.error(err.message || "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExchange = (id: string) => {
    setSelectedExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSizeRange = (id: string) => {
    setSelectedSizeRanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getUserLabel = (u: { first_name: string | null; last_name: string | null; username: string }) =>
    u.first_name && u.last_name ? `${u.first_name} ${u.last_name} (@${u.username})` : `@${u.username}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Configure: {displayName}
          </DialogTitle>
          <DialogDescription>Set jurisdiction, exchange mappings, and operational config for @{username}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Supervisor */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" /> Reports To (Supervisor)
              </label>
              <Select
                value={profile.reports_to || "__none__"}
                onValueChange={(v) => setProfile(p => ({ ...p, reports_to: v === "__none__" ? null : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No supervisor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No supervisor</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{getUserLabel(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specialization */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Specialization
              </label>
              <Select
                value={profile.specialization}
                onValueChange={(v) => setProfile(p => ({ ...p, specialization: v }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase Only</SelectItem>
                  <SelectItem value="sales">Sales Only</SelectItem>
                  <SelectItem value="both">Both (Purchase & Sales)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shift */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Shift
              </label>
              <Select
                value={profile.shift || "__none__"}
                onValueChange={(v) => setProfile(p => ({ ...p, shift: v === "__none__" ? null : v }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No shift assigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No shift</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" /> Active Status
                </label>
                <Switch
                  checked={profile.is_active}
                  onCheckedChange={(v) => setProfile(p => ({ ...p, is_active: v }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" /> Include in Automation
                </label>
                <Switch
                  checked={profile.automation_included}
                  onCheckedChange={(v) => setProfile(p => ({ ...p, automation_included: v }))}
                />
              </div>
            </div>

            {/* Exchange Accounts */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Exchange Account Mapping
              </label>
              {exchangeAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No exchange accounts configured yet.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-2">
                  {exchangeAccounts.map(ea => (
                    <label key={ea.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-1">
                      <Checkbox
                        checked={selectedExchanges.has(ea.id)}
                        onCheckedChange={() => toggleExchange(ea.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{ea.account_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Size Ranges */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Order Size Range Mapping
              </label>
              {sizeRanges.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No size ranges configured yet.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-2">
                  {sizeRanges.map(sr => (
                    <label key={sr.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/20 rounded px-1 py-1">
                      <Checkbox
                        checked={selectedSizeRanges.has(sr.id)}
                        onCheckedChange={() => toggleSizeRange(sr.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{sr.name}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        ₹{sr.min_amount.toLocaleString()} – {sr.max_amount ? `₹${sr.max_amount.toLocaleString()}` : '∞'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
