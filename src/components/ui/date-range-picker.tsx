import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, isToday, isYesterday } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type DateRangePreset = 
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "lastMonth"
  | "last3months"
  | "last6months"
  | "thisYear"
  | "lastYear"
  | "allTime"
  | "custom";

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  preset?: DateRangePreset;
  onPresetChange?: (preset: DateRangePreset) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

const presets: { label: string; value: DateRangePreset }[] = [
  { label: "All Time", value: "allTime" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7days" },
  { label: "Last 30 Days", value: "last30days" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last 3 Months", value: "last3months" },
  { label: "Last 6 Months", value: "last6months" },
  { label: "This Year", value: "thisYear" },
  { label: "Last Year", value: "lastYear" },
];

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      const yesterday = subDays(today, 1);
      return { from: yesterday, to: yesterday };
    case "last7days":
      return { from: subDays(today, 6), to: today };
    case "last30days":
      return { from: subDays(today, 29), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "lastMonth":
      const lastMonth = subMonths(today, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    case "last3months":
      return { from: subMonths(today, 3), to: today };
    case "last6months":
      return { from: subMonths(today, 6), to: today };
    case "thisYear":
      return { from: startOfYear(today), to: endOfYear(today) };
    case "lastYear":
      const lastYear = subYears(today, 1);
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
    case "allTime":
      return undefined;
    case "custom":
      return undefined;
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export function getPresetLabel(preset: DateRangePreset): string {
  const found = presets.find(p => p.value === preset);
  if (found) return found.label;
  if (preset === "allTime") return "All Time";
  if (preset === "custom") return "Custom Range";
  return "Select Range";
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  preset = "thisMonth",
  onPresetChange,
  className,
  align = "start",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [localRange, setLocalRange] = React.useState<DateRange | undefined>(dateRange);
  const [selectedPreset, setSelectedPreset] = React.useState<DateRangePreset>(preset);

  React.useEffect(() => {
    setLocalRange(dateRange);
  }, [dateRange]);

  React.useEffect(() => {
    setSelectedPreset(preset);
  }, [preset]);

  const handlePresetClick = (presetValue: DateRangePreset) => {
    setSelectedPreset(presetValue);
    const range = getDateRangeFromPreset(presetValue);
    setLocalRange(range);
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setLocalRange(range);
    setSelectedPreset("custom");
  };

  const handleApply = () => {
    onDateRangeChange(localRange);
    onPresetChange?.(selectedPreset);
    setOpen(false);
  };

  const handleClear = () => {
    setLocalRange(undefined);
    setSelectedPreset("allTime");
  };

  const getDisplayText = () => {
    if (!dateRange?.from) {
      return "All Time";
    }
    
    if (preset !== "custom" && preset !== "allTime") {
      return getPresetLabel(preset);
    }
    
    if (dateRange.from && dateRange.to) {
      if (format(dateRange.from, "yyyy-MM-dd") === format(dateRange.to, "yyyy-MM-dd")) {
        return format(dateRange.from, "MMM dd, yyyy");
      }
      return `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd, yyyy")}`;
    }
    
    if (dateRange.from) {
      return format(dateRange.from, "MMM dd, yyyy");
    }
    
    return "Select Range";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !dateRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span>{getDisplayText()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-background border shadow-lg z-50" align={align}>
        <div className="p-4 space-y-4">
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.value}
                variant={selectedPreset === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetClick(p.value)}
                className="text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Range label */}
          <div className="text-sm font-medium text-muted-foreground">
            Custom Range
          </div>

          {/* Calendar */}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={localRange?.from}
            selected={localRange}
            onSelect={handleCalendarSelect}
            numberOfMonths={1}
            className="pointer-events-auto rounded-md border"
          />

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
            >
              Apply Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
