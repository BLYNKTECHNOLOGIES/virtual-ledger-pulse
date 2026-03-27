import { Badge } from '@/components/ui/badge';

const statusConfig = {
  open: { label: 'Open', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
};

export function TaskStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
