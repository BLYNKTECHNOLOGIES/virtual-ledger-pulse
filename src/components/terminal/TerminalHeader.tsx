import { SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export function TerminalHeader() {
  const { username, email, firstName, lastName, avatarUrl, terminalRoles, isLoading } = useTerminalAuth();
  const { logout } = useAuth();

  const displayName = firstName && lastName
    ? `${firstName} ${lastName}`
    : firstName || username || email || '—';

  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : (username || email || '?')[0].toUpperCase();

  const roleLabel = terminalRoles.length > 0
    ? terminalRoles.map((r) => r.role_name).join(', ')
    : 'No terminal role';

  return (
    <header className="h-10 flex items-center justify-between border-b border-border px-4 bg-card/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
        <Separator orientation="vertical" className="h-3.5" />
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-[0.12em]">Connected</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Bell className="h-3.5 w-3.5" />
        </Button>

        {!isLoading && email && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-7 gap-1.5 px-1.5 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-medium max-w-[100px] truncate hidden sm:inline">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {terminalRoles.map((r) => (
                      <Badge key={r.role_id} variant="secondary" className="text-[9px] h-4 px-1.5">
                        <Shield className="h-2.5 w-2.5 mr-0.5" />
                        {r.role_name}
                      </Badge>
                    ))}
                    {terminalRoles.length === 0 && (
                      <span className="text-[9px] text-muted-foreground italic">No terminal role assigned</span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
