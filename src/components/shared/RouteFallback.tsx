import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for lazily-loaded routes.
 * Renders a thin top progress bar plus a content-shaped skeleton instead of
 * a bare spinner, so route transitions feel instant. Presentation-only.
 *
 * Terminal routes render inside the `.terminal` theme scope so the fallback
 * matches the dark exchange UI instead of the enterprise light theme.
 */
export function RouteFallback() {
  const isTerminal =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/terminal");

  const content = (
    <div className="min-h-screen w-full bg-background">
      <div className="ds-topbar" aria-hidden />
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6" role="status" aria-label="Loading">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );

  return isTerminal ? <div className="terminal">{content}</div> : content;
}

export default RouteFallback;
