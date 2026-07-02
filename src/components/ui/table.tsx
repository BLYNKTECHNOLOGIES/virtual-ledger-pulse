
import * as React from "react"

import { cn } from "@/lib/utils"

type Density = "comfortable" | "compact"

const DensityContext = React.createContext<Density>("comfortable")

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Adds a sticky header that stays visible while the body scrolls. */
  stickyHeader?: boolean
  /** Row height density. `compact` tightens cell padding for dense data grids. */
  density?: Density
  /** Constrains scroll height so the sticky header has something to scroll against. */
  maxHeight?: string | number
  containerClassName?: string
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, stickyHeader, density = "comfortable", maxHeight, containerClassName, ...props }, ref) => (
    <DensityContext.Provider value={density}>
      <div
        className={cn(
          "relative w-full overflow-auto rounded-lg border border-border",
          containerClassName
        )}
        style={maxHeight ? { maxHeight } : undefined}
        data-sticky-header={stickyHeader ? "" : undefined}
      >
        <table
          ref={ref}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  )
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-muted/50 [&_tr]:border-b",
      // Sticky header: only engages when the parent <Table stickyHeader> is set.
      "[[data-sticky-header]_&]:sticky [[data-sticky-header]_&]:top-0 [[data-sticky-header]_&]:z-10 [[data-sticky-header]_&]:bg-muted [[data-sticky-header]_&]:shadow-[0_1px_0_0_hsl(var(--border))]",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Briefly flashes the row to signal a freshly updated/synced value. */
  flash?: boolean
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, flash, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-muted/50 data-[state=selected]:bg-muted",
        flash && "row-flash",
        className
      )}
      {...props}
    />
  )
)
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => {
  const density = React.useContext(DensityContext)
  return (
    <th
      ref={ref}
      className={cn(
        "px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground [&:has([role=checkbox])]:pr-0 [&:has([role=checkbox])]:normal-case",
        density === "compact" ? "h-9" : "h-11",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => {
  const density = React.useContext(DensityContext)
  return (
    <td
      ref={ref}
      className={cn(
        "px-4 align-middle text-foreground [&:has([role=checkbox])]:pr-0",
        density === "compact" ? "py-2" : "py-4",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
