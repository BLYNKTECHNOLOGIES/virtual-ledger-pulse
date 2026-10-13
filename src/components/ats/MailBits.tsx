import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tidySubject } from "@/lib/ats/mailText";
import { mailErrorMessage, type MailStatus } from "@/lib/ats/mail";
import { fmtDateTime, fmtRelative } from "@/lib/ats/format";

/** Muted "Will be sent as" line, shown only when the server would change the subject. */
export function SubjectSentAs({ subject }: { subject: string }) {
  const sent = tidySubject(subject);
  if (sent === subject.trim()) return null;
  return <p className="text-xs text-muted-foreground">Will be sent as: "{sent}"</p>;
}

/** Asked before resending an email whose send was interrupted (it may already have arrived). */
export function InterruptedRetryDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send this email again?</AlertDialogTitle>
          <AlertDialogDescription>
            The connection dropped while this email was being sent, so it may already have reached the candidate. Check the Sent folder of the HR mailbox before sending it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onOpenChange(false); onConfirm(); }}>Send again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Last checked …", plus the last successful check when the latest run failed (same on Inbox and Settings). */
export function LastChecked({ sync, className }: { sync: MailStatus["sync"]; className?: string }) {
  const failing = !!(sync?.last_error_at && (!sync.last_ok_at || sync.last_error_at > sync.last_ok_at));
  return (
    <span className={className}>
      <span title={sync?.last_run_at ? fmtDateTime(sync.last_run_at) : "Not checked yet"}>Last checked {sync?.last_run_at ? fmtRelative(sync.last_run_at) : "never"}</span>
      {failing && (
        <span className="text-warning" title={mailErrorMessage(sync!.last_error)}> · last successful check {sync!.last_ok_at ? fmtRelative(sync!.last_ok_at) : "never"}</span>
      )}
    </span>
  );
}
