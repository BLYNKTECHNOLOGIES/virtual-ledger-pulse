import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

interface TaskFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
  showCompleted: boolean;
  onShowCompletedChange: (v: boolean) => void;
  overdue: boolean;
  onOverdueChange: (v: boolean) => void;
}

export function TaskFilters({
  search, onSearchChange,
  status, onStatusChange,
  priority, onPriorityChange,
  showCompleted, onShowCompletedChange,
  overdue, onOverdueChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={priority} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch id="overdue" checked={overdue} onCheckedChange={onOverdueChange} />
        <Label htmlFor="overdue" className="text-sm cursor-pointer">Overdue</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="completed" checked={showCompleted} onCheckedChange={onShowCompletedChange} />
        <Label htmlFor="completed" className="text-sm cursor-pointer">Show Completed</Label>
      </div>
    </div>
  );
}
