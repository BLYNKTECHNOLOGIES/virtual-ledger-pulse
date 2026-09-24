import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Building2, Eye, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  displayName: string;
}

export function SendBiometricInviteDialog({ open, onOpenChange, userId, displayName }: Props) {
  const qc = useQueryClient();
  const [level, setLevel] = useState<'office' | 'view_only'>('view_only');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('terminal-biometric-invite', {
        body: { action: 'send', user_id: userId, trust_level: level, note: note.trim() || null },
      });
      const msg = (data as { error?: string } | null)?.error;
      if (error || msg) {
        let detail = msg;
        if (!detail && error && 'context' in error) {
          try { detail = (await (error as { context: Response }).context.json())?.error; } catch { /* ignore */ }
        }
        throw new Error(typeof detail === 'string' ? detail : error?.message || 'Could not send the link');
      }
      toast.success(`Registration link sent to ${(data as { sent_to: string }).sent_to}`);
      qc.invalidateQueries({ queryKey: ['terminal-biometric-invites'] });
      onOpenChange(false);
      setNote('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Send biometric registration
          </DialogTitle>
          <DialogDescription>
            {displayName} gets an email link, valid 24 hours, that registers one device. Sending again cancels any earlier link.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={level} onValueChange={(v) => setLevel(v as 'office' | 'view_only')} className="space-y-2">
          <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
            <RadioGroupItem value="office" className="mt-1" />
            <div>
              <div className="flex items-center gap-1 font-medium text-foreground"><Building2 className="h-4 w-4" /> Office device</div>
              <p className="text-xs text-muted-foreground">Full access — everything their role allows.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer">
            <RadioGroupItem value="view_only" className="mt-1" />
            <div>
              <div className="flex items-center gap-1 font-medium text-foreground"><Eye className="h-4 w-4" /> Personal device</div>
              <p className="text-xs text-muted-foreground">View only — can watch, cannot act.</p>
            </div>
          </label>
        </RadioGroup>

        <div className="space-y-1">
          <Label htmlFor="invite-note">Note (optional)</Label>
          <Textarea id="invite-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="text-foreground" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
