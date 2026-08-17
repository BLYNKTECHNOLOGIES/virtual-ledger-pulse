// Shared tab styling for the Compliance module.
// Two clearly-ranked levels:
//   PRIMARY   – module/category selector (Banking · Legal · Company …): solid segmented control
//   SECONDARY – section navigation inside a category: light underline tabs

// ---------- Primary (module selector) ----------
export const complianceTabsListCls =
  "mx-auto inline-flex h-auto w-auto max-w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto " +
  "rounded-lg border border-border bg-muted/70 p-1 shadow-xs";

export const complianceTabTriggerCls =
  "rounded-md border-0 px-4 py-2 text-sm font-semibold tracking-tight text-muted-foreground whitespace-nowrap gap-2 " +
  "transition-colors hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-0 data-[state=active]:shadow-sm";

export const complianceTabsWrapperCls = "flex w-full justify-center";

// ---------- Secondary (section navigation) ----------
export const complianceSubTabsListCls =
  "mx-auto inline-flex h-auto w-auto max-w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto " +
  "rounded-none border-0 bg-transparent p-0 shadow-none";

export const complianceSubTabTriggerCls =
  "relative rounded-none border-0 bg-transparent px-3 py-1.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap gap-2 " +
  "transition-colors hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-transparent after:transition-colors " +
  "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:bg-primary";

export const complianceSubTabsWrapperCls =
  "flex w-full justify-center border-b border-border/70";
