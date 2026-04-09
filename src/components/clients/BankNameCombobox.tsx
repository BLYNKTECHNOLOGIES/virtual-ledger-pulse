import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ALL_INDIAN_BANKS } from "@/data/allIndianBanks";

interface BankNameComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function BankNameCombobox({ value, onChange, className }: BankNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_INDIAN_BANKS;
    const q = search.toLowerCase();
    return ALL_INDIAN_BANKS.filter(b => b.label.toLowerCase().includes(q));
  }, [search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const bank of filtered) {
      const arr = map.get(bank.category) || [];
      arr.push(bank);
      map.set(bank.category, arr);
    }
    return map;
  }, [filtered]);

  const handleSelect = (bankName: string) => {
    onChange(bankName);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{value || "Select bank..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search bank..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {filtered.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No bank found.
              </div>
            )}
            {Array.from(grouped.entries()).map(([category, banks]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground sticky top-0 bg-popover">
                  {category}
                </div>
                {banks.map((bank) => (
                  <button
                    key={bank.label}
                    type="button"
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      value === bank.label && "bg-accent"
                    )}
                    onClick={() => handleSelect(bank.label)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === bank.label ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{bank.label}</span>
                  </button>
                ))}
              </div>
            ))}
            {/* Other option always at the bottom */}
            <div className="border-t mt-1 pt-1">
              <button
                type="button"
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === "Other" && "bg-accent"
                )}
                onClick={() => handleSelect("Other")}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === "Other" ? "opacity-100" : "opacity-0"
                  )}
                />
                Other
              </button>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
