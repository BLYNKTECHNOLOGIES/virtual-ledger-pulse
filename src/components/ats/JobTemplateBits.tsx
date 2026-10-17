import { useId, useState } from "react";
import { ChevronDown, ClipboardList, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { type EffectiveJobTemplate, templateSettingsHref, templateSourceText } from "@/lib/ats/jobTemplates";

/** One line naming the template a job uses, with a link to it ("Edit template" for HR admins, "View template" for others). */
export function TemplateSourceLine({ template, designation, newTab = false, canEdit = false }: {
  template: EffectiveJobTemplate; designation?: string | null; newTab?: boolean; canEdit?: boolean;
}) {
  const label = canEdit ? "Edit template" : "View template";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{designation ? `${designation} template` : "Designation template"} · {templateSourceText(template)}</span>
      {newTab ? (
        <a href={templateSettingsHref(template.position_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
          {label} <ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <Link to={templateSettingsHref(template.position_id)} className="font-medium text-primary underline-offset-2 hover:underline">{label}</Link>
      )}
    </p>
  );
}

/** The template's HR-only notes: hiring standard and what to test in the interview. Never shown to candidates. */
export function HiringBrief({ template, designation, defaultOpen = true, className }: { template: EffectiveJobTemplate; designation?: string | null; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  if (!template.hr_notes.trim()) return null;
  const title = `Hiring brief${designation ? ` · ${designation}` : ""}`;
  return (
    <div className={cn("rounded-lg border border-border bg-muted/30", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">HR only. Never shown on the careers page.</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        // Focusable so the scrolling panel can be read with the keyboard.
        <p id={panelId} tabIndex={0} role="region" aria-label={title}
          className="max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-border px-3 py-2.5 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {template.hr_notes}
        </p>
      )}
    </div>
  );
}
