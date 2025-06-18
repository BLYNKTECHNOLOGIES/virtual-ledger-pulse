
import { memo, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from './Layout';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

const RouteLoadingSkeleton = () => (
  <div className="p-6 space-y-6">
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

export const RouteLayout = memo(function RouteLayout() {
  const { user } = useAuth();

  return (
    <Layout>
      <Suspense fallback={<RouteLoadingSkeleton />}>
        <Outlet context={{ user }} />
      </Suspense>
    </Layout>
  );
});
