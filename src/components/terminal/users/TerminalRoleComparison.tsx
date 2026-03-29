import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeftRight, CheckCircle2, XCircle, Minus } from "lucide-react";
import { TerminalPermission } from "@/hooks/useTerminalAuth";

interface Role {
  id: string;
  name: string;
  permissions: string[];
}

interface ModuleDef {
  key: string;
  label: string;
  icon: string;
  permissions: { key: TerminalPermission; label: string; tier: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  modules: ModuleDef[];
}

export function TerminalRoleComparison({ open, onOpenChange, roles, modules }: Props) {
  const [roleAId, setRoleAId] = useState("");
  const [roleBId, setRoleBId] = useState("");

  const roleA = roles.find(r => r.id === roleAId);
  const roleB = roles.find(r => r.id === roleBId);

  const permsA = useMemo(() => new Set(roleA?.permissions || []), [roleA]);
  const permsB = useMemo(() => new Set(roleB?.permissions || []), [roleB]);

  const stats = useMemo(() => {
    if (!roleA || !roleB) return null;
    const allPerms = new Set([...permsA, ...permsB]);
    let shared = 0, onlyA = 0, onlyB = 0;
    allPerms.forEach(p => {
      if (permsA.has(p) && permsB.has(p)) shared++;
      else if (permsA.has(p)) onlyA++;
      else onlyB++;
    });
    return { shared, onlyA, onlyB, total: allPerms.size };
  }, [permsA, permsB, roleA, roleB]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Compare Roles
          </DialogTitle>
        </DialogHeader>

        {/* Role Selectors */}
        <div className="px-6 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Role A</label>
            <Select value={roleAId} onValueChange={setRoleAId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name} ({r.permissions.length})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Role B</label>
            <Select value={roleBId} onValueChange={setRoleBId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name} ({r.permissions.length})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Banner */}
        {stats && (
          <div className="px-6 flex flex-wrap gap-3 text-xs">
            <Badge variant="secondary" className="gap-1">
              <span className="text-muted-foreground">Shared:</span> {stats.shared}
            </Badge>
            <Badge variant="outline" className="gap-1 border-blue-500/30 text-blue-400">
              Only {roleA?.name}: {stats.onlyA}
            </Badge>
            <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-400">
              Only {roleB?.name}: {stats.onlyB}
            </Badge>
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              Total: {stats.total}
            </Badge>
          </div>
        )}

        {/* Comparison Grid */}
        <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
          {roleA && roleB ? (
            <div className="space-y-3 pr-2 pb-4">
              {modules.map(mod => {
                const hasAny = mod.permissions.some(p => permsA.has(p.key) || permsB.has(p.key));
                if (!hasAny) return null;
                return (
                  <div key={mod.key} className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted/10 flex items-center gap-2">
                      <span className="text-sm">{mod.icon}</span>
                      <span className="text-xs font-medium">{mod.label}</span>
                    </div>
                    <div className="px-3 pb-2 pt-1">
                      {mod.permissions.map(perm => {
                        const inA = permsA.has(perm.key);
                        const inB = permsB.has(perm.key);
                        const both = inA && inB;
                        const neither = !inA && !inB;
                        if (neither) return null;

                        let rowClass = "";
                        if (both) rowClass = "bg-emerald-500/5";
                        else if (inA) rowClass = "bg-blue-500/5";
                        else rowClass = "bg-amber-500/5";

                        return (
                          <div key={perm.key} className={`flex items-center justify-between py-1 px-2 rounded text-xs ${rowClass}`}>
                            <span className="text-muted-foreground flex-1">{perm.label}</span>
                            <div className="flex items-center gap-6 shrink-0">
                              <span className="w-16 text-center">
                                {inA ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/30 inline" />}
                              </span>
                              <span className="w-16 text-center">
                                {inB ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/30 inline" />}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ArrowLeftRight className="h-8 w-8 opacity-20" />
              <p className="text-sm">Select two roles to compare</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
