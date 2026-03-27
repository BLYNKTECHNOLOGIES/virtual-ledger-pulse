import { TaskAssignment } from '@/hooks/useTasks';
import { ArrowRight, User } from 'lucide-react';

export function TaskAssignmentChain({ assignments, creatorName }: { assignments: TaskAssignment[]; creatorName?: string }) {
  if (!assignments.length) {
    return <p className="text-sm text-muted-foreground">No assignment history</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      {assignments.map((a, i) => (
        <div key={a.id} className="flex items-center gap-1">
          {i === 0 && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-muted-foreground">
                <User className="h-3 w-3" />
                {a.from_user_name}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${i === assignments.length - 1 ? 'bg-primary/10 text-primary font-medium' : 'bg-muted text-muted-foreground'}`}>
            <User className="h-3 w-3" />
            {a.to_user_name}
          </span>
          {i < assignments.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}
