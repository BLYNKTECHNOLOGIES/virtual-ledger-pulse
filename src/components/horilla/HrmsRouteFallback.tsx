import { useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { hrmsPageShape } from "@/lib/hrmsPrefetch";

/**
 * Suspense fallback rendered INSIDE the HRMS shell, so the sidebar and header
 * stay mounted while the next page's chunk loads. Presentation-only.
 *
 * The skeleton mirrors the footprint of the page family being loaded so the
 * layout does not jump when the real content mounts.
 */
export function HrmsRouteFallback() {
  const { pathname } = useLocation();
  const shape = hrmsPageShape(pathname);

  return (
    <div className="animate-fade-in space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>

      {/* Page title block — present on every HRMS page */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3.5 w-72" />
      </div>

      {shape === "dashboard" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
              <Skeleton className="h-4 w-40 mb-4" />
              <Skeleton className="h-48 w-full" />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
        </>
      )}

      {shape === "list" && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Skeleton className="h-9 w-full max-w-xs" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="hidden h-3.5 w-32 sm:block" />
                <Skeleton className="hidden h-3.5 w-24 md:block" />
                <Skeleton className="ml-auto h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {shape === "detail" && (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24" />
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default HrmsRouteFallback;
