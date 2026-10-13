import { useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmCopy = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Red confirm button (the default) for deletes, rejections and other hard-to-undo actions. */
  destructive?: boolean;
  cancelLabel?: string;
};

/**
 * "Are you sure?" step in front of an action that is hard to undo. Presentation only: onConfirm is
 * exactly what the button ran before. Controlled version, for triggers inside menus or lists.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive = true,
  cancelLabel = "Go back",
}: ConfirmCopy & { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Clicks inside the dialog must not reach a clickable row or card behind it. */}
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Wraps one button so it asks first. The wrapped button must not have its own onClick. */
export function ConfirmButton({
  children,
  onConfirm,
  ...copy
}: ConfirmCopy & { children: ReactElement; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Slot
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </Slot>
      <ConfirmDialog open={open} onOpenChange={setOpen} onConfirm={onConfirm} {...copy} />
    </>
  );
}
