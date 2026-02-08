import { Settings } from "lucide-react";

export default function TerminalSettings() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-muted-foreground gap-3">
      <Settings className="h-12 w-12" />
      <h2 className="text-xl font-semibold text-foreground">Settings</h2>
      <p className="text-sm">Terminal settings coming soon.</p>
    </div>
  );
}
