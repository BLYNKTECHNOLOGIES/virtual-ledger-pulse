import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Phone, MapPin, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

interface Props {
  counterpartyNickname: string;
}

export function CounterpartyContactInput({ counterpartyNickname }: Props) {
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

      // Sync to client master if a client is linked by name
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .ilike('name', counterpartyNickname)
        .limit(1);

      if (clients && clients.length > 0) {
        const updates: any = {};
        if (trimmedPhone) updates.phone = trimmedPhone;
        if (trimmedState) updates.state = trimmedState;
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('clients')
            .update(updates)
            .eq('id', clients[0].id);
        }
      }

      // Propagate to terminal_sales_sync records that match this counterparty
      // This ensures post-approval updates are reflected
      const syncUpdates: any = {};
      if (trimmedPhone) syncUpdates.contact_number = trimmedPhone;
      if (trimmedState) syncUpdates.state = trimmedState;
      if (Object.keys(syncUpdates).length > 0) {
        // Match by counterparty_nickname (masked) using prefix
        const prefix = counterpartyNickname.slice(0, 3);
        await supabase
          .from('terminal_sales_sync')
          .update(syncUpdates)
          .ilike('order_data->>counterparty_nickname', `${prefix}%`);

        // Also update linked sales_orders
        const { data: syncRecords } = await supabase
          .from('terminal_sales_sync')
          .select('sales_order_id')
          .ilike('order_data->>counterparty_nickname', `${prefix}%`)
          .not('sales_order_id', 'is', null);

        if (syncRecords && syncRecords.length > 0) {
          const soUpdates: any = {};
          if (trimmedPhone) soUpdates.client_phone = trimmedPhone;
          if (trimmedState) soUpdates.client_state = trimmedState;
          const orderIds = syncRecords.map(r => r.sales_order_id).filter(Boolean);
          if (orderIds.length > 0) {
            await supabase
              .from('sales_orders')
              .update(soUpdates)
              .in('id', orderIds);
          }
        }
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
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-1">
        <Phone className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Contact & State</span>
        {hasContact && !isEditing && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-50 text-green-700 border-green-200">
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
