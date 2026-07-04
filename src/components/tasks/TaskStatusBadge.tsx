import { Badge } from '@/components/ui/badge';

const statusConfig = {
  open: { label: 'Open', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-info/10 text-info border-info/20' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success border-success/20' },
};

export function TaskStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
