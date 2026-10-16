import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { AlertCircle, UserPlus, Check, Clock } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { cn, matchesWordPrefix } from "@/lib/utils";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Chip, fmtInr, useDropdownFit } from "@/components/orders-ui";

interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onRiskLevelChange?: (riskLevel: string) => void;
  onPhoneChange?: (phone: string) => void;
  onStateChange?: (state: string) => void;
  onClientSelect?: (client: any) => void;
  onNewClient?: (isNew: boolean) => void;
  onApprovalSelect?: (approval: any) => void;
  selectedClientId?: string;
  label?: string;
  placeholder?: string;
  /** Presentation only: the parent renders the label itself (e.g. a kit `Field` with htmlFor="customerName"). */
  hideLabel?: boolean;
}

export function CustomerAutocomplete({
  value,
  onChange,
  onRiskLevelChange,
  onPhoneChange,
  onStateChange,
  onClientSelect,
  onNewClient,
  onApprovalSelect,
  selectedClientId,
  label = "Customer Name *",
  placeholder = "Enter customer name",
  hideLabel = false,
}: CustomerAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasExactMatch, setHasExactMatch] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [pendingApprovalMatch, setPendingApprovalMatch] = useState<any | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const debouncedValue = useDebounce(value, 300);

  const { data: clients } = useQuery({
    queryKey: ['clients-all-search'],
    queryFn: async () => {
      // Use paginated fetch — there are >1000 clients and PostgREST caps
      // a single request at 1000 rows. The secondary .order('id') is REQUIRED:
      // ~178 clients share duplicate names, and ordering only by a non-unique
      // column makes page boundaries unstable, silently dropping clients
      // (e.g. "Sanyam Jain") from the search results.
      return await fetchAllPaginated<any>(() =>
        supabase.from('clients').select('*').order('name').order('id')
      );
    },
  });

  // Targeted server-side search. The cached full list can be large and slow to
  // refresh; this guarantees an existing client (however old) is always found
  // by name / phone / PAN even if the cached list is stale or truncated.
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

  // All known clients = cached full list + live server matches (de-duped)
  const knownClients = useMemo(() => {
    const map = new Map<string, any>();
    (clients || []).forEach((c: any) => map.set(c.id, c));
    (serverMatches || []).forEach((c: any) => map.set(c.id, c));
    return Array.from(map.values());
  }, [clients, serverMatches]);

  // Pending onboarding approvals — these are counterparties that have
  // transacted but do NOT yet exist in the clients table. Surfacing them here
  // prevents operators from creating duplicate clients for someone who is
  // already waiting in the approval queue.
  const { data: pendingApprovals } = useQuery({
    queryKey: ['pending-approvals-search'],
    queryFn: async () => {
      const rows = await fetchAllPaginated<any>(() =>
        supabase
          .from('client_onboarding_approvals')
          .select('id, client_name, client_phone, binance_nickname, cp_userno, order_amount, order_date, resolved_client_id')
          .eq('approval_status', 'PENDING')
          .is('resolved_client_id', null)
          .order('order_date', { ascending: false })
      );
      // Ignore anchor-less ghost approvals: pure-name-only rows (no phone, no
      // Binance nickname, no cp_userno) can't be reliably matched to a real
      // counterparty and would falsely block new sales sharing that name.
      // Project identity rule keys on userNo/phone/nickname, never name.
      return rows.filter((a: any) =>
        !!(a.cp_userno || a.client_phone || a.binance_nickname)
      );
    },
  });

  // Filter clients based on input - search by name, phone, or PAN
  // Exclude deleted clients and rejected buyers
  const filteredClients = useMemo(() => {
    if (!knownClients.length || !debouncedValue.trim()) return [];
    const searchTerm = debouncedValue.toLowerCase().trim();
    return knownClients.filter(client => {
      // Skip deleted clients
      if ((client as any).is_deleted) return false;
      // Skip rejected buyers
      if (client.buyer_approval_status === 'REJECTED') return false;
      
      return matchesWordPrefix(searchTerm, client.name) ||
        (client.phone && client.phone.includes(searchTerm)) ||
        (client.pan_card_number && client.pan_card_number.toLowerCase().includes(searchTerm));
    });
  }, [knownClients, debouncedValue]);

  // Filter pending approvals by the same search term. Match on name, phone or
  // Binance nickname so operators can find the queued client however they type.
  const filteredApprovals = useMemo(() => {
    if (!pendingApprovals || !debouncedValue.trim()) return [];
    const searchTerm = debouncedValue.toLowerCase().trim();
    const seen = new Set<string>();
    return pendingApprovals.filter((a: any) => {
      const matches =
        matchesWordPrefix(searchTerm, a.client_name || '') ||
        (a.client_phone && a.client_phone.includes(searchTerm)) ||
        (a.binance_nickname && a.binance_nickname.toLowerCase().includes(searchTerm));
      if (!matches) return false;
      // De-dupe repeated approvals for the same person (name + phone)
      const key = `${(a.client_name || '').toLowerCase()}|${a.client_phone || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [pendingApprovals, debouncedValue]);


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

    setHasExactMatch(!!exactMatch);
    
    // If there's an exact match but no client selected, user must select from dropdown
    if (exactMatch && !selectedClientId) {
      setIsNewClient(false);
      onNewClient?.(false);
    } else if (!exactMatch && value.trim().length > 0) {
      // New client will be created
      setIsNewClient(true);
      onNewClient?.(true);
    } else {
      setIsNewClient(false);
      onNewClient?.(false);
    }
  }, [value, knownClients, selectedClientId, onNewClient]);

  // Detect whether the typed name matches a client already sitting in the
  // pending onboarding approval queue — surfaces a warning so the operator
  // doesn't create a duplicate client.
  useEffect(() => {
    if (!pendingApprovals || !value.trim() || selectedClientId) {
      setPendingApprovalMatch(null);
      return;
    }
    const match = pendingApprovals.find(
      (a: any) => (a.client_name || '').toLowerCase() === value.trim().toLowerCase()
    );
    setPendingApprovalMatch(match || null);
  }, [value, pendingApprovals, selectedClientId]);

  const handleApprovalSelect = (approval: any) => {
    onChange(approval.client_name || '');
    if (onPhoneChange && approval.client_phone) {
      onPhoneChange(approval.client_phone);
    }
    if (onApprovalSelect) {
      onApprovalSelect(approval);
    }
    setPendingApprovalMatch(approval);
    setShowSuggestions(false);
  };

  const handleClientSelect = (client: any) => {
    onChange(client.name);
    
    // Auto-populate phone number
    if (onPhoneChange && client.phone) {
      onPhoneChange(client.phone);
    }
    
    // Auto-populate state
    if (onStateChange && client.state) {
      onStateChange(client.state);
    }
    
    // Pass the full client object
    if (onClientSelect) {
      onClientSelect(client);
    }
    
    if (onRiskLevelChange) {
      // Map client risk appetite to payment method risk categories
      const riskMapping: Record<string, string> = {
        'PREMIUM': 'Premium',
        'ESTABLISHED': 'Established',
        'STANDARD': 'Standard',
        'CAUTIOUS': 'Cautious',
        'HIGH_RISK': 'High Risk',
        // Legacy fallbacks
        'HIGH': 'High Risk',
        'MEDIUM': 'Standard', 
        'LOW': 'Premium',
        'NONE': 'Standard'
      };
      const mappedRisk = riskMapping[client.risk_appetite as keyof typeof riskMapping] || 'Standard';
      onRiskLevelChange(mappedRisk);
    }
    
    setShowSuggestions(false);
    setIsNewClient(false);
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    // Clear the selected client when user types
    if (onClientSelect && selectedClientId) {
      onClientSelect(null);
    }
    setShowSuggestions(true);
  };

  /* ── Presentation only (derived from the values above) ──────────────── */

  // A suggestion found through its PAN shows that PAN, so the match is visible; other rows don't
  // print PAN numbers.
  const suggestionTerm = debouncedValue.toLowerCase().trim();
  const matchedOnPan = (client: any) =>
    !!client.pan_card_number &&
    client.pan_card_number.toLowerCase().includes(suggestionTerm) &&
    !matchesWordPrefix(suggestionTerm, client.name) &&
    !(client.phone && client.phone.includes(suggestionTerm));
  const showExactMatchWarning = hasExactMatch && !selectedClientId;
  const showApprovalWarning = !!pendingApprovalMatch && !hasExactMatch && !selectedClientId;
  const showNewBuyerNote = isNewClient && !hasExactMatch && !pendingApprovalMatch && value.trim().length > 0;
  const hasStatus = showExactMatchWarning || showApprovalWarning || showNewBuyerNote || !!selectedClientId;
  const listShown = showSuggestions && (filteredClients.length > 0 || filteredApprovals.length > 0);
  const noMatchShown = showSuggestions && value.trim().length > 0 && filteredClients.length === 0 && filteredApprovals.length === 0 && !hasExactMatch;
  // Inside a dialog, the list ends above the footer (it would otherwise run under it).
  const { anchorRef, maxHeight: listMaxHeight } = useDropdownFit(listShown || noMatchShown, `${filteredClients.length}|${filteredApprovals.length}|${noMatchShown}`);

  return (
    <div className="relative">
      {!hideLabel && <Label htmlFor="customerName">{label}</Label>}
      <div className="relative" ref={anchorRef}>
        <Input
          id="customerName"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          required
          className={cn(
            selectedClientId && "pr-9",
            showExactMatchWarning && "border-warning pr-10 focus-visible:border-warning focus-visible:ring-warning/40",
          )}
        />
        {selectedClientId && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" aria-hidden />
        )}

        {/* Suggestions: clients first, then counterparties still waiting in the onboarding queue */}
        {showSuggestions && (filteredClients.length > 0 || filteredApprovals.length > 0) && (
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
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[client.phone, client.state].filter(Boolean).join(" · ") || "No phone or state on file"}
                        {matchedOnPan(client) && (
                          <span className="font-mono text-[11px]"> · PAN {client.pan_card_number}</span>
                        )}
                      </div>
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

              {/* Pending onboarding approvals — not yet real clients */}
              {filteredApprovals.length > 0 && (
                <div className={cn(filteredClients.length > 0 && "mt-1 border-t border-border pt-1")}>
                  <div className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    <Clock className="h-3 w-3 text-warning" aria-hidden />
                    In approval queue · not yet onboarded
                  </div>
                  {filteredApprovals.map((a: any) => (
                    <div
                      key={a.id}
                      className="cursor-pointer px-3 py-2 transition-colors hover:bg-muted"
                      onClick={() => handleApprovalSelect(a)}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-foreground">{a.client_name}</span>
                        <Chip tone="warning" className="shrink-0">Pending approval</Chip>
                      </div>
                      <div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                        {[a.client_phone, a.binance_nickname, a.order_amount != null ? fmtInr(a.order_amount) : null].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* No matches found */}
        {showSuggestions && value.trim().length > 0 && filteredClients.length === 0 && filteredApprovals.length === 0 && !hasExactMatch && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[20rem] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
            <div className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>No existing client matches. A new buyer goes to the approvals queue when the order is created.</span>
            </div>
          </div>
        )}
      </div>

      {/* Status of the typed name */}
      {hasStatus && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {showExactMatchWarning && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              This client exists — select them from the suggestions
            </p>
          )}

          {showApprovalWarning && (
            <Chip tone="warning" className="max-w-full whitespace-normal">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              Already in approval queue — don't create a duplicate
            </Chip>
          )}

          {showNewBuyerNote && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
              New buyer · goes to the approvals queue with this order
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
