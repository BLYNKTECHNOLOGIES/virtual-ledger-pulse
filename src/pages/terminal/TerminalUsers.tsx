import { Users } from "lucide-react";

export default function TerminalUsers() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-muted-foreground gap-3">
      <Users className="h-12 w-12" />
      <h2 className="text-xl font-semibold text-foreground">Users & Roles</h2>
      <p className="text-sm">Terminal user and role management coming soon.</p>
    </div>
  );
}
