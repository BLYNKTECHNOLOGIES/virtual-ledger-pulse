import { Mail } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUnreadCandidateIds } from "@/lib/ats/mail";

/** Small envelope shown next to a candidate's name when they have an unread email reply. */
export function UnreadMailMark({ candidateId }: { candidateId?: string | null }) {
  const ids = useUnreadCandidateIds();
  if (!candidateId || !ids.data?.has(candidateId)) return null;
  return (
    <TooltipProvider><Tooltip><TooltipTrigger asChild>
      <span className="inline-flex shrink-0 text-primary" aria-label="Unread email reply"><Mail className="h-3.5 w-3.5" /></span>
    </TooltipTrigger><TooltipContent>Unread email reply</TooltipContent></Tooltip></TooltipProvider>
  );
}
