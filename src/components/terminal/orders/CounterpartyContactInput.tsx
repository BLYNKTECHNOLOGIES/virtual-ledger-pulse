import { useState, useEffect } from "react";
import { isPhoneBlocked } from "@/lib/blocked-phones";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Phone, MapPin, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { toast } from "sonner";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface Props {
  counterpartyNickname: string;
  /** Binance order number of the order being viewed; propagation keys off its counterparty identity. */
  orderNumber: string;
}

export function CounterpartyContactInput({ counterpartyNickname, orderNumber }: Props) {
  const queryClient = useQueryClient();
  const [contactNumber, setContactNumber] = useState("");
  const [state, setState] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Fetch existing contact record
  const { data: contactRecord, isLoading } = useQuery({
    queryKey: ['counterparty-contact', counterpartyNickname],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counterparty_contact_records')
        .select('*')
        .eq('counterparty_nickname', counterpartyNickname)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!counterpartyNickname,
  });

  useEffect(() => {
    if (contactRecord) {
      setContactNumber(contactRecord.contact_number || "");
      setState(contactRecord.state || "");
    }
  }, [contactRecord]);

  // Upsert mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedPhone = contactNumber.trim();
      const trimmedState = state.trim();
      
      if (!trimmedPhone && !trimmedState) throw new Error("Enter at least one field");

      // Block known operator/placeholder phones
      if (trimmedPhone && await isPhoneBlocked(trimmedPhone)) {
        throw new Error("This phone number is blocked — it's a known operator/placeholder number and cannot be used as a client contact.");
      }

      const userId = getCurrentUserId();

      const { error } = await supabase
        .from('counterparty_contact_records')
        .upsert({
          counterparty_nickname: counterpartyNickname,
          contact_number: trimmedPhone || null,
          state: trimmedState || null,
          collected_by: userId || undefined,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'counterparty_nickname' });
      if (error) throw error;

      // Do NOT sync to client master by name matching — this causes cross-contamination.
      // Client updates should only happen during approval flow with explicit client ID linking.

      // Propagate only to this counterparty's own orders (exact Binance userNo,
      // else exact unmasked nickname — never a prefix or masked nickname).
      // Approved sales orders are only filled when empty. See propagate_counterparty_contact.
      if (orderNumber) {
        const { error: propErr } = await supabase.rpc('propagate_counterparty_contact' as any, {
          p_order_number: orderNumber,
          p_phone: trimmedPhone || null,
          p_state: trimmedState || null,
        });
        if (propErr) throw propErr;
      }
    },
    onSuccess: () => {
      toast.success("Contact details saved");
      queryClient.invalidateQueries({ queryKey: ['counterparty-contact', counterpartyNickname] });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Loading contact...</span>
      </div>
    );
  }

  const hasContact = !!(contactRecord?.contact_number || contactRecord?.state);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Phone className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact & State</span>
        {hasContact && !isEditing && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-success/10 text-success border-success/20">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Captured
          </Badge>
        )}
      </div>

      {hasContact && !isEditing ? (
        <div className="space-y-1">
          {contactRecord?.contact_number && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-xs text-foreground">{contactRecord.contact_number}</span>
            </div>
          )}
          {contactRecord?.state && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-xs text-foreground">{contactRecord.state}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Input
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="Contact number"
            className="h-7 text-xs"
            maxLength={15}
          />
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent className="bg-popover border z-50 max-h-[200px]">
              {INDIAN_STATES_AND_UTS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-7 text-[10px] gap-1 flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (!contactNumber.trim() && !state.trim())}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </Button>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] px-2"
                onClick={() => {
                  setIsEditing(false);
                  setContactNumber(contactRecord?.contact_number || "");
                  setState(contactRecord?.state || "");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
