import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tidySubject } from "@/lib/ats/mailText";

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
