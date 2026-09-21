import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * ResponsiveDialog — renders as a bottom sheet (Drawer) on phones and as a
 * centered Dialog on desktop. Device-driven, not user-selectable.
 *
 * Usage mirrors shadcn Dialog: pass `open`, `onOpenChange`, `title`, optional
 * `description`, children body, and optional `footer`.
 */
export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional className for the desktop DialogContent (e.g. `max-w-2xl`). */
  contentClassName?: string;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
            ) : null}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
          {footer ? <DrawerFooter className="gap-2 [&>button]:w-full">{footer}</DrawerFooter> : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Single scroller: DialogContent is flex + overflow-hidden, body is the only scroll area */}
      <DialogContent className={cn("flex max-h-[90vh] flex-col overflow-hidden", contentClassName)}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
        {footer ? <DialogFooter className="shrink-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
