import { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Short, human-readable headline. */
  title?: string;
  /** Friendly explanation. Avoid technical detail here. */
  description?: string;
  /** Raw error — only surfaced in development, behind a details toggle. */
  error?: unknown;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

function extractMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}

/**
 * ErrorState — shared, non-technical error presentation.
 * Raw error text is only shown in development builds.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again in a moment.",
  error,
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  const detail = import.meta.env.DEV ? extractMessage(error) : null;

  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
        )}
        {action}
      </div>
      {detail && (
        <details className="mt-4 max-w-md text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">Details (dev only)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
    </div>
  );
}

export default ErrorState;
