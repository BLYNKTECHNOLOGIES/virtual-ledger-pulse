
import { Badge } from '@/components/ui/badge';

interface OPStatusBadgeProps {
  status: 'Pending' | 'Processing' | 'Completed';
}

export function OPStatusBadge({ status }: OPStatusBadgeProps) {
  const variants: Record<string, string> = {
    Pending: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    Processing: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    Completed: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  };

  return (
    <Badge variant="outline" className={`${variants[status]} font-medium text-xs px-3 py-1`}>
      {status}
    </Badge>
  );
}
