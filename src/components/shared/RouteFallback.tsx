import { Loader2 } from "lucide-react";

/**
 * Minimal, token-based centered loading state used as the Suspense fallback
 * for lazily-loaded routes. Presentation-only.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default RouteFallback;
