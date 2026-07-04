import { Badge } from '@/components/ui/badge';

const priorityConfig = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-info/10 text-info border-info/20' },
  high: { label: 'High', className: 'bg-warning/10 text-warning border-warning/20' },
  critical: { label: 'Critical', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export function TaskPriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
