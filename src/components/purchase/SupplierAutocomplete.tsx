import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { AlertCircle, UserPlus, Check } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { cn, matchesWordPrefix } from "@/lib/utils";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Chip, useDropdownFit } from "@/components/orders-ui";

interface ClientBankDetails {
  pan_card_number?: string | null;
  linked_bank_accounts?: Array<{
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    ifsc_code?: string;
  }> | null;
}

interface SupplierAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onContactChange?: (contact: string) => void;
  onClientSelect?: (clientId: string, clientName: string, bankDetails?: ClientBankDetails) => void;
  onNewClient?: (isNew: boolean) => void;
  selectedClientId?: string;
  /** Presentation only: the parent renders the label itself (e.g. a kit `Field` with htmlFor="sellerName"). */
  hideLabel?: boolean;
}

export function SupplierAutocomplete({ 
  value, 
  onChange, 
  onContactChange,
  onClientSelect,
  onNewClient,
  selectedClientId,
  hideLabel = false,
}: SupplierAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasExactMatch, setHasExactMatch] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const debouncedValue = useDebounce(value, 300);

  const { data: clients } = useQuery({
    queryKey: ['clients-all-search'],
    queryFn: async () => {
      // Use paginated fetch — there are >1000 clients and PostgREST caps
      // a single request at 1000 rows. The secondary .order('id') is REQUIRED:
      // duplicate client names make a name-only sort unstable across page
      // boundaries, silently dropping clients from the search results.
      return await fetchAllPaginated<any>(() =>
        supabase.from('clients').select('*').order('name').order('id')
      );
    },
  });

  // Targeted server-side search — guarantees an existing client (however old)
  // is always found even if the cached full list is stale or truncated.
  const { data: serverMatches } = useQuery({
    queryKey: ['clients-server-search', debouncedValue.trim().toLowerCase()],
    enabled: debouncedValue.trim().length >= 2,
    queryFn: async () => {
      const term = debouncedValue.trim().replace(/[%,()]/g, ' ').trim();
      if (!term) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,pan_card_number.ilike.%${term}%`)
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const knownClients = useMemo(() => {
    const map = new Map<string, any>();
    (clients || []).forEach((c: any) => map.set(c.id, c));
    (serverMatches || []).forEach((c: any) => map.set(c.id, c));
    return Array.from(map.values());
  }, [clients, serverMatches]);

  // Filter clients based on input - exclude deleted and rejected clients
  const filteredClients = useMemo(() => {
    if (!knownClients.length || !debouncedValue.trim()) return [];
    
    const prefixMatches = knownClients.filter(client => {
      // Skip deleted clients
      if ((client as any).is_deleted) return false;
      // Skip rejected sellers
      if (client.seller_approval_status === 'REJECTED') return false;
      
      const searchTerm = debouncedValue.trim().toLowerCase();
      
      // Word-boundary prefix matching for names only
      if (matchesWordPrefix(debouncedValue, client.name)) return true;
      
      // Phone and PAN use substring matching
      if (client.phone && client.phone.includes(searchTerm)) return true;
      if (client.pan_card_number && client.pan_card_number.toLowerCase().includes(searchTerm)) return true;
      
      return false;
    });
    
    return prefixMatches;
  }, [knownClients, debouncedValue]);

  // Check for exact match
  useEffect(() => {
    if (!knownClients.length || !value.trim()) {
      setHasExactMatch(false);
      setIsNewClient(false);
      onNewClient?.(false);
      return;
    }

    const exactMatch = knownClients.find(
      c => c.name.toLowerCase() === value.trim().toLowerCase()
    );
    
    // Also check for partial match (client name contains input or vice versa)
    const partialMatch = knownClients.find(
      c => c.name.toLowerCase().includes(value.trim().toLowerCase()) ||
           value.trim().toLowerCase().includes(c.name.toLowerCase())
    );

    // Only show "client exists" warning if we have an exact match AND the client appears in suggestions
    // This prevents showing the warning when no suggestions are visible
    const matchFound = exactMatch || partialMatch;
    const matchAppearsInSuggestions = matchFound && filteredClients.some(
      fc => fc.id === exactMatch?.id || fc.id === partialMatch?.id
    );
    
    setHasExactMatch(!!matchAppearsInSuggestions);
    
    // If there's an exact match but no client selected, user must select from dropdown
    if (matchAppearsInSuggestions && !selectedClientId) {
      setIsNewClient(false);
      onNewClient?.(false);
    } else if (!matchAppearsInSuggestions && value.trim().length > 0) {
      // New client will be created
      setIsNewClient(true);
      onNewClient?.(true);
    } else {
      setIsNewClient(false);
      onNewClient?.(false);
    }
  }, [value, knownClients, selectedClientId, onNewClient, filteredClients]);

  const handleClientSelect = (client: any) => {
    onChange(client.name);
    if (onContactChange && client.phone) {
      onContactChange(client.phone);
    }
    if (onClientSelect) {
      // Pass bank details along with client selection
      const bankDetails: ClientBankDetails = {
        pan_card_number: client.pan_card_number,
        linked_bank_accounts: client.linked_bank_accounts,
      };
      onClientSelect(client.id, client.name, bankDetails);
    }
    setShowSuggestions(false);
    setIsNewClient(false);
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    // Clear the selected client when user types
    if (onClientSelect && selectedClientId) {
      onClientSelect('', newValue);
    }
    setShowSuggestions(true);
  };

  /* ── Presentation only (derived from the values above) ──────────────── */
  const showExistsWarning = hasExactMatch && !selectedClientId;
  const showNewSeller = isNewClient && !hasExactMatch && value.trim().length > 0;
  const hasStatus = showExistsWarning || showNewSeller || !!selectedClientId;
  const listShown = showSuggestions && filteredClients.length > 0;
  const noMatchShown = showSuggestions && value.trim().length > 0 && filteredClients.length === 0 && !hasExactMatch;
  // Inside a dialog, the list ends above the footer (it would otherwise run under it).
  const { anchorRef, maxHeight: listMaxHeight } = useDropdownFit(listShown || noMatchShown, `${filteredClients.length}|${noMatchShown}`);

  return (
    <div className="relative min-w-0">
      {!hideLabel && (
        <Label htmlFor="sellerName" className="mb-1.5 block">Seller Name *</Label>
      )}
      <div className="relative" ref={anchorRef}>
        <Input
          id="sellerName"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Enter seller name"
          required
          className={cn(
            selectedClientId && "pr-9",
            showExistsWarning && "border-warning pr-10 focus-visible:border-warning focus-visible:ring-warning/40",
          )}
        />
        {selectedClientId && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" aria-hidden />
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && filteredClients.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[20rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
            <div className="max-h-64 overflow-y-auto overscroll-contain py-1" style={listMaxHeight ? { maxHeight: listMaxHeight } : undefined}>
              {filteredClients.map((client) => (
                <HoverCard key={client.id} openDelay={300} closeDelay={100} onOpenChange={(open) => {
                  if (open) setHoveredClientId(client.id);
                }}>
                  <HoverCardTrigger asChild>
                    <div
                      className={cn(
                        "cursor-pointer px-3 py-2 transition-colors hover:bg-muted",
                        client.id === selectedClientId && "bg-accent",
                      )}
                      onClick={() => handleClientSelect(client)}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-foreground">{client.name}</span>
                        {client.client_id && (
                          <span className="shrink-0 rounded border border-border bg-muted/60 px-1.5 font-mono text-[11px] leading-[18px] text-muted-foreground">
                            {client.client_id}
                          </span>
                        )}
                      </div>
                      {(client.phone || client.email || client.client_type) && (
                        <div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                          {[client.phone, client.email, client.client_type].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="right"
                    align="start"
                    className="w-80 p-3 z-[200] bg-popover border border-border shadow-md"
                    sideOffset={8}
                  >
                    <ClientOrderPreview
                      clientId={client.id}
                      clientName={client.name}
                      clientData={{
                        client_id: client.client_id,
                        phone: client.phone,
                        date_of_onboarding: client.date_of_onboarding,
                        client_type: client.client_type,
                        is_buyer: client.is_buyer,
                        is_seller: client.is_seller
                      }}
                      isOpen={hoveredClientId === client.id}
                    />
                  </HoverCardContent>
                </HoverCard>
              ))}
            </div>
          </div>
        )}

        {/* No matches found */}
        {showSuggestions && value.trim().length > 0 && filteredClients.length === 0 && !hasExactMatch && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[20rem] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
            <div className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>No existing clients found. A new seller will be created on submission.</span>
            </div>
          </div>
        )}
      </div>

      {/* Status of the typed name */}
      {hasStatus && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {showExistsWarning && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              This client exists — select them from the suggestions
            </p>
          )}

          {showNewSeller && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
              New seller · created with this order
            </p>
          )}

          {selectedClientId && (
            <Chip tone="success">
              <Check className="h-3 w-3" aria-hidden />
              Existing client selected
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}
