import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CreditCard, Loader2, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentUserId } from "@/lib/system-action-logger";

interface Props {
  counterpartyNickname: string;
}

export function CounterpartyPanInput({ counterpartyNickname }: Props) {
  const queryClient = useQueryClient();
  const [panValue, setPanValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Fetch existing PAN
  const { data: panRecord, isLoading } = useQuery({
    queryKey: ['counterparty-pan', counterpartyNickname],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counterparty_pan_records')
        .select('*')
        .eq('counterparty_nickname', counterpartyNickname)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!counterpartyNickname,
  });

  useEffect(() => {
    if (panRecord?.pan_number) {
      setPanValue(panRecord.pan_number);
    }
  }, [panRecord]);

  // Upsert PAN mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = panValue.trim().toUpperCase();
      if (!trimmed) throw new Error("PAN cannot be empty");
      // Basic PAN format validation (Indian PAN: 5 letters, 4 digits, 1 letter)
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(trimmed)) {
        throw new Error("Invalid PAN format (expected: ABCDE1234F)");
      }

      const userId = getCurrentUserId();

      const { error } = await supabase
        .from('counterparty_pan_records')
        .upsert({
          counterparty_nickname: counterpartyNickname,
          pan_number: trimmed,
          collected_by: userId || undefined,
        }, { onConflict: 'counterparty_nickname' });
      if (error) throw error;

      // Also sync to client master if a client is linked by name
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .ilike('name', counterpartyNickname)
        .limit(1);

      if (clients && clients.length > 0) {
        await supabase
          .from('clients')
          .update({ pan_card_number: trimmed })
          .eq('id', clients[0].id);
      }
    },
    onSuccess: () => {
      toast.success("PAN saved successfully");
      queryClient.invalidateQueries({ queryKey: ['counterparty-pan', counterpartyNickname] });
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
        <span className="text-[10px] text-muted-foreground">Loading PAN...</span>
      </div>
    );
  }

  const hasPan = !!panRecord?.pan_number;

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-1">
        <CreditCard className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">PAN Details</span>
        {hasPan && !isEditing && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Verified
          </Badge>
        )}
      </div>

      {hasPan && !isEditing ? (
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-foreground">{panRecord!.pan_number}</span>
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
        <div className="flex items-center gap-1.5">
          <Input
            value={panValue}
            onChange={(e) => setPanValue(e.target.value.toUpperCase())}
            placeholder="ABCDE1234F"
            className="h-7 text-xs font-mono flex-1"
            maxLength={10}
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !panValue.trim()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
          </Button>
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => { setIsEditing(false); setPanValue(panRecord?.pan_number || ""); }}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
