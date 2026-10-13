import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsErrorMessage } from "@/lib/ats/errors";
import { candKeys } from "@/lib/ats/candidates";
import { convKeys, istIso, istYmd, logContact } from "@/lib/ats/conversations";
import { Req } from "./AtsUi";

export const CALL_OUTCOMES = [
  { value: "connected", label: "Spoke to the candidate" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "switched_off", label: "Phone switched off" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "call_back", label: "Asked to call back" },
] as const;

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  candidateId: string; applicationId: string | null; candidateName: string;
  onSaved?: () => void; onEditProfile?: () => void;
}

export function LogCallDialog({ open, onOpenChange, candidateId, applicationId, candidateName, onSaved, onEditProfile }: Props) {
  const qc = useQueryClient();
  const first = candidateName.trim().split(/\s+/)[0] || "the candidate";
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [fu, setFu] = useState("off");
  const [date, setDate] = useState(() => istYmd(new Date(), 1));
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [wrongSaved, setWrongSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOutcome(""); setNote(""); setFu("off"); setDate(istYmd(new Date(), 1)); setTime("10:00"); setWrongSaved(false);
  }, [open]);

  const followUp = (): string | null => {
    if (fu === "2h") return new Date(Date.now() + 2 * 3_600_000).toISOString();
    if (fu === "tomorrow") return istIso(istYmd(new Date(), 1), "10:00");
    if (fu === "pick") return date && time ? istIso(date, time) : null;
    return null;
  };
  const fuAt = followUp();
  const fuInvalid = fu === "pick" && (!fuAt || new Date(fuAt).getTime() <= Date.now());

  const save = async () => {
    if (!outcome || busy || fuInvalid) return;
    setBusy(true);
    try {
      await logContact({ candidateId, applicationId, channel: "call", outcome, note: note.trim() || null, followUpAt: fuAt });
      toast.success("Call logged");
      qc.invalidateQueries({ queryKey: candKeys.events(candidateId) });
      qc.invalidateQueries({ queryKey: convKeys.all });
      onSaved?.();
      if (outcome === "wrong_number") setWrongSaved(true);
      else onOpenChange(false);
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Log a call with ${first}`}
      footer={wrongSaved ? (
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      ) : (<>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={!outcome || busy || fuInvalid} onClick={save}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
      </>)}>
      {wrongSaved ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Update the phone number?</p>
          {onEditProfile && <Button variant="outline" onClick={() => { onOpenChange(false); onEditProfile(); }}>Edit profile</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Outcome<Req /></Label>
            <RadioGroup value={outcome} onValueChange={setOutcome} className="grid gap-2 sm:grid-cols-2">
              {CALL_OUTCOMES.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground has-[:checked]:border-primary">
                  <RadioGroupItem value={o.value} />{o.label}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1">
            <Label htmlFor="call-note">Note</Label>
            <Textarea id="call-note" maxLength={1000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label>Follow up</Label>
            <Select value={fu} onValueChange={setFu}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="2h">In 2 hours</SelectItem>
                <SelectItem value="tomorrow">Tomorrow, 10:00 AM</SelectItem>
                <SelectItem value="pick">Pick date and time…</SelectItem>
              </SelectContent>
            </Select>
            {fu === "pick" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input type="date" aria-label="Follow-up date" value={date} min={istYmd(new Date())} onChange={(e) => setDate(e.target.value)} className="text-foreground" />
                <Input type="time" aria-label="Follow-up time (IST)" value={time} onChange={(e) => setTime(e.target.value)} className="text-foreground" />
              </div>
            )}
            {fuInvalid && <p className="text-xs text-destructive">Pick a time in the future.</p>}
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}
