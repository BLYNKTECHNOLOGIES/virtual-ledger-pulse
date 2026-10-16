/**
 * Dialog layout for the Sales and Purchase dialogs: fixed header, scrolling body,
 * footer that stays visible. Presentation only.
 *
 *   <DialogContent className={dialogContentClass("xl")}>
 *     <DialogHead icon={Receipt} title="Create sales order" description="…" />
 *     <form onSubmit={…} className={DIALOG_FORM}>
 *       <DialogBody>…</DialogBody>
 *       <DialogFoot>…buttons…</DialogFoot>
 *     </form>
 *   </DialogContent>
 *
 * Widths: the base DialogContent caps every dialog at md:max-w-lg (512px), so a
 * width must be given with the md: prefix — dialogContentClass does that.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const DIALOG_WIDTH = {
  sm: "md:max-w-md", // 448px — confirmations, one-field dialogs
  md: "md:max-w-lg", // 512px — short forms
  lg: "md:max-w-2xl", // 672px — details, approvals
  xl: "md:max-w-3xl", // 768px — order forms
  xxl: "md:max-w-4xl", // 896px — wide forms with three columns
} as const;

export type DialogWidth = keyof typeof DIALOG_WIDTH;

/**
 * className for <DialogContent>: flex column, no outer padding, explicit width. Between 768px and the
 * dialog's max width it keeps a 1rem gutter on each side (the base class is md:w-full).
 */
export function dialogContentClass(width: DialogWidth = "lg", extra?: string) {
  return cn("flex flex-col gap-0 overflow-hidden p-0 md:w-[calc(100%-2rem)] md:p-0", DIALOG_WIDTH[width], extra);
}

/** className for a <form> placed between DialogHead and DialogBody/DialogFoot. */
export const DIALOG_FORM = "flex min-h-0 flex-1 flex-col";

/** Title row with an optional icon, a one-line description and chips (meta). */
export function DialogHead({
  icon: Icon,
  title,
  description,
  meta,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <DialogHeader className={cn("shrink-0 space-y-1 border-b border-border px-4 py-3.5 pr-12 text-left sm:text-left md:px-6 md:py-4", className)}>
      <DialogTitle className="flex min-w-0 items-center gap-2.5 !text-base font-semibold !leading-6 tracking-tight">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 break-words">{title}</span>
      </DialogTitle>
      {description && <DialogDescription className={cn("text-[13px] leading-5", Icon && "sm:pl-[42px]")}>{description}</DialogDescription>}
      {meta && <div className={cn("flex flex-wrap items-center gap-1.5 pt-1", Icon && "sm:pl-[42px]")}>{meta}</div>}
    </DialogHeader>
  );
}

/**
 * Scrolling middle of the dialog. `relative` matters: inside a <form>, Radix Select / Checkbox / Switch
 * render hidden absolutely-positioned inputs, which must stay inside the scrolling body — otherwise
 * they overflow DialogContent and, with the phone rule that makes dialogs scrollable, the whole
 * panel (header and footer included) can be scrolled.
 */
export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5", className)}>{children}</div>;
}

/** Footer that stays visible. `start` holds a short note or a secondary action on the left. */
export function DialogFoot({ children, start, className }: { children: ReactNode; start?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3 md:px-6", className)}>
      {start && <div className="mr-auto min-w-0 text-xs text-muted-foreground">{start}</div>}
      {children}
    </div>
  );
}

/** Label + control + optional hint / error. Keep the control's own id and pass it as htmlFor. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  aside,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small control on the label line (e.g. a "Split payment" checkbox). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </Label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Responsive grid for fields: 1 column on phones, `cols` from sm/md up. */
export function FieldGrid({ cols = 2, children, className }: { cols?: 2 | 3 | 4; children: ReactNode; className?: string }) {
  const c = cols === 4 ? "sm:grid-cols-2 md:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return <div className={cn("grid grid-cols-1 gap-x-4 gap-y-3.5", c, className)}>{children}</div>;
}
