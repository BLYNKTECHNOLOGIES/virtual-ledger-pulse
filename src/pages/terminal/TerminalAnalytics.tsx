import { Activity } from "lucide-react";

export default function TerminalAnalytics() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-muted-foreground gap-3">
      <Activity className="h-12 w-12" />
      <h2 className="text-xl font-semibold text-foreground">Analytics</h2>
      <p className="text-sm">Terminal analytics coming soon.</p>
    </div>
  );
}
