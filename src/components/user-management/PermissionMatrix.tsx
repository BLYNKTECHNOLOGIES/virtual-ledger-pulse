import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERMISSION_MODULES, PERMISSION_SECTION_ORDER, ROLE_TEMPLATES } from "@/lib/permissions/catalog";
import { TIER_META, TIER_ORDER } from "./umUi";

interface PermissionMatrixProps {
  /** Selected permission keys. */
  value: string[];
  /** Receives an updater, so the parent applies it to its latest state (same as the original setFormData(prev => …)). */
  onChange: (update: (prev: string[]) => string[]) => void;
  /** Show the quick templates row (a template replaces the selection). */
  templates?: boolean;
  onTemplateApplied?: (templateName: string) => void;
}

/**
 * The role permission picker, rendered from the single-source catalog: one row
 * per module grouped by section, with search, "All / Clear" per module and the
 * tier colours. Used by both "New role" and "Edit role". Selection state is
 * owned by the parent; this component never saves anything.
 */
export function PermissionMatrix({ value, onChange, templates, onTemplateApplied }: PermissionMatrixProps) {
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [permissionSearch, setPermissionSearch] = useState("");

  const filteredModules = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase();
    const entries = Object.entries(PERMISSION_MODULES);
    if (!q) return entries;
    return entries
      .map(([key, mod]) => {
        if (mod.label.toLowerCase().includes(q)) return [key, mod] as typeof entries[number];
        const perms = mod.permissions.filter(
          (p) =>
            p.id.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        );
        return perms.length > 0 ? ([key, { ...mod, permissions: perms }] as typeof entries[number]) : null;
      })
      .filter(Boolean) as typeof entries;
  }, [permissionSearch]);

  const toggleAllInModule = (ids: string[], checked: boolean) => {
    onChange((prev) => (checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((p) => !ids.includes(p))));
  };

  const handlePermissionChange = (permissionId: string, checked: boolean) => {
    onChange((prev) => (checked ? [...prev, permissionId] : prev.filter((p) => p !== permissionId)));
  };

  const toggleModule = (key: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyTemplate = (template: typeof ROLE_TEMPLATES[0]) => {
    onChange(() => template.getPermissions());
    onTemplateApplied?.(template.name);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Permissions</p>
          <p className="text-xs text-muted-foreground">{value.length} selected</p>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Colour key">
          {TIER_ORDER.filter((t) => t !== "special").map((t) => {
            const Icon = TIER_META[t].icon;
            return (
              <span key={t} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TIER_META[t].badge)}>
                <Icon className="h-3 w-3" /> {TIER_META[t].label}
              </span>
            );
          })}
        </div>
      </div>

      {templates && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Start from a template:</span>
          {ROLE_TEMPLATES.map((template) => (
            <Button key={template.name} type="button" variant="outline" size="sm" onClick={() => applyTemplate(template)} className="h-7 px-2.5 text-xs">
              {template.name}
            </Button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={permissionSearch}
          onChange={(e) => setPermissionSearch(e.target.value)}
          placeholder="Search permissions or modules…"
          aria-label="Search permissions or modules"
          className="pl-8 text-foreground"
        />
      </div>

      <div className="space-y-4">
        {PERMISSION_SECTION_ORDER.map((section) => {
          const modules = filteredModules.filter(([, m]) => (m.section || "Core") === section);
          if (modules.length === 0) return null;
          return (
            <div key={section}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</p>
              {/* 1px gaps on a border-coloured background draw the grid lines; an odd last module spans both columns. */}
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 md:[&>*:last-child:nth-child(odd)]:col-span-2">
                {modules.map(([key, module]) => {
                  const isCollapsed = collapsedModules.has(key) && !permissionSearch.trim();
                  const modulePermCount = module.permissions.filter((p) => value.includes(p.id)).length;
                  const allChecked = modulePermCount === module.permissions.length;
                  return (
                    <div key={key} className="bg-card">
                    <div className={cn("h-full", key === "destructive" && "bg-destructive/[0.06]")}>
                      <div className="flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-muted/40 sm:px-4">
                        <button
                          type="button"
                          onClick={() => toggleModule(key)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={!isCollapsed}
                        >
                          {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="truncate text-sm font-medium text-foreground">{module.label}</span>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={cn("text-[11px] tabular-nums", modulePermCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                            {modulePermCount}/{module.permissions.length}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleAllInModule(module.permissions.map((p) => p.id), !allChecked)}
                          >
                            {allChecked ? "Clear" : "All"}
                          </Button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="flex flex-wrap gap-2 px-3 pb-3 pt-0.5 sm:px-4">
                          {module.permissions.map((perm) => {
                            const tier = TIER_META[perm.tier] || TIER_META.special;
                            const isChecked = value.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                title={perm.description}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                                  isChecked ? tier.badge : "border-border bg-background text-muted-foreground hover:text-foreground",
                                )}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => handlePermissionChange(perm.id, checked as boolean)}
                                  className="h-3.5 w-3.5"
                                />
                                {perm.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filteredModules.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No permission matches "{permissionSearch.trim()}".
          </p>
        )}
      </div>
    </div>
  );
}
