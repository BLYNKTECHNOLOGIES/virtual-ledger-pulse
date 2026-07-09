import { Loader2 } from "lucide-react";

/**
 * Minimal, token-based centered loading state used as the Suspense fallback
 * for lazily-loaded routes. Presentation-only.
 *
 * Terminal routes render inside the `.terminal` theme scope so the fallback
 * matches the dark exchange UI instead of the enterprise light theme.
 */
export function RouteFallback() {
  const isTerminal =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/terminal");

  const content = (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return isTerminal ? <div className="terminal">{content}</div> : content;
}

export default RouteFallback;
