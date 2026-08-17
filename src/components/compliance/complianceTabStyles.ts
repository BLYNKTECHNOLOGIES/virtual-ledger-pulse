// Shared tab styling for the Compliance module.
// Segmented-control look: centered, pill shaped, no harsh focus box.

export const complianceTabsListCls =
  "mx-auto inline-flex h-auto w-auto max-w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto rounded-full border border-border bg-muted/50 p-1 shadow-xs";

export const complianceTabTriggerCls =
  "rounded-full border-0 px-4 py-2 text-xs md:text-sm font-medium text-muted-foreground whitespace-nowrap gap-2 " +
  "transition-colors hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-0 data-[state=active]:shadow-sm";

export const complianceTabsWrapperCls = "flex w-full justify-center";
