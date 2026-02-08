import { SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function TerminalHeader() {
  return (
    <header className="h-11 flex items-center justify-between border-b border-border px-4 bg-card/60 backdrop-blur-md shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors" />
        <Separator orientation="vertical" className="h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Live</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
          <Bell className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
          <User className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
