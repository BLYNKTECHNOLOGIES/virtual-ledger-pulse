import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  value: string;
  label: string;
  /** extra searchable text, e.g. badge id */
  keywords?: string;
}

interface ComboboxProps {
  options: EmployeeOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

/**
 * Searchable single-select. Keeps the full scrollable list, adds type-to-search.
 */
export function EmployeeCombobox({
  options,
  value,
  onChange,
  placeholder = "Employee",
  className,
  disabled,
  searchPlaceholder = "Search name or badge…",
  emptyText = "No employee found.",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between font-normal text-foreground",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[260px] p-0 z-[60]"
        align="start"
      >
        <Command
          filter={(val, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            return val.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.keywords || ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface EmployeeLike {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  badge_id?: string | null;
  is_active?: boolean | null;
  [k: string]: any;
}

interface PickerProps {
  employees: EmployeeLike[] | undefined | null;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** show badge id in the label (default true) */
  showBadge?: boolean;
  /** prepend an "All employees" style option */
  allOption?: { value: string; label: string };
}

/**
 * Drop-in searchable replacement for the employee `<Select>` dropdowns
 * used across HRMS forms and filters.
 */
export function EmployeePicker({
  employees,
  value,
  onChange,
  placeholder = "Select employee",
  className,
  disabled,
  showBadge = true,
  allOption,
}: PickerProps) {
  const options: EmployeeOption[] = [
    ...(allOption ? [{ value: allOption.value, label: allOption.label }] : []),
    ...(employees || []).map((e) => {
      const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.name || "Unnamed";
      const badge = e.badge_id ? `${e.badge_id}` : "";
      return {
        value: e.id,
        label: showBadge && badge ? `${name} (${badge})` : name,
        keywords: badge,
      };
    }),
  ];

  return (
    <EmployeeCombobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}
