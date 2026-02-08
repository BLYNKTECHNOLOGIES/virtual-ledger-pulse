import { SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function TerminalHeader() {
  return (
    <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-card shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
