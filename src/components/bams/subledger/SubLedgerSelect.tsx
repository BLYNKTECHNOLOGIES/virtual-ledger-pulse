import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useCreditSubLedgers, useCreateSubLedger } from "@/hooks/useCreditSubLedgers";

interface SubLedgerSelectProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Only render when the selected bank account is a CREDIT account. */
  isCreditAccount: boolean;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable combobox for selecting a credit sub-ledger (person).
 * Renders only when a CREDIT account is selected. Supports inline creation.
 */
export function SubLedgerSelect({
  value,
  onChange,
  isCreditAccount,
  label = "Sub-Ledger (Person)",
  required = true,
  disabled = false,
  className,
}: SubLedgerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: subLedgers = [], isLoading } = useCreditSubLedgers();
  const createSubLedger = useCreateSubLedger();
  const { toast } = useToast();

  if (!isCreditAccount) return null;

  const selected = subLedgers.find((s) => s.id === value);
  const trimmedSearch = search.trim();
  const exactMatch = subLedgers.some(
    (s) => s.name.toLowerCase() === trimmedSearch.toLowerCase()
  );

  const handleCreate = async () => {
    if (!trimmedSearch) return;
    try {
      const created = await createSubLedger.mutateAsync(trimmedSearch);
      onChange(created.id);
      setSearch("");
      setOpen(false);
      toast({ title: "Sub-ledger created", description: created.name });
    } catch (e: any) {
      toast({
        title: "Could not create sub-ledger",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={className}>
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal text-foreground"
          >
            {selected ? selected.name : "Select sub-ledger..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or type a new name..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <>
                  <CommandEmpty>No sub-ledger found.</CommandEmpty>
                  <CommandGroup>
                    {subLedgers.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={s.name}
                        onSelect={() => {
                          onChange(s.id);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === s.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {s.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {trimmedSearch && !exactMatch && (
                    <CommandGroup>
                      <CommandItem
                        value={`__create__${trimmedSearch}`}
                        onSelect={handleCreate}
                        disabled={createSubLedger.isPending}
                      >
                        {createSubLedger.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Create "{trimmedSearch}"
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
