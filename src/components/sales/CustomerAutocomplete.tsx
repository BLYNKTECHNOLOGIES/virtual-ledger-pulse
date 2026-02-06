import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { AlertCircle, UserPlus, Check } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ClientOrderPreview } from "@/components/clients/ClientOrderPreview";
import { matchesWordPrefix } from "@/lib/utils";

interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onRiskLevelChange?: (riskLevel: string) => void;
  onPhoneChange?: (phone: string) => void;
  onStateChange?: (state: string) => void;
  onClientSelect?: (client: any) => void;
  onNewClient?: (isNew: boolean) => void;
  selectedClientId?: string;
  label?: string;
  placeholder?: string;
}

export function CustomerAutocomplete({ 
  value, 
  onChange, 
  onRiskLevelChange,
  onPhoneChange,
  onStateChange,
  onClientSelect,
  onNewClient,
  selectedClientId,
  label = "Customer Name *",
  placeholder = "Enter customer name"
}: CustomerAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasExactMatch, setHasExactMatch] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const debouncedValue = useDebounce(value, 300);

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Filter clients based on input - search by name, phone, or PAN
  // Exclude deleted clients and rejected buyers
  const filteredClients = useMemo(() => {
    if (!clients || !debouncedValue.trim()) return [];
    const searchTerm = debouncedValue.toLowerCase().trim();
    return clients.filter(client => {
      // Skip deleted clients
      if ((client as any).is_deleted) return false;
      // Skip rejected buyers
      if (client.buyer_approval_status === 'REJECTED') return false;
      
      return matchesWordPrefix(searchTerm, client.name) ||
        (client.phone && client.phone.includes(searchTerm)) ||
        (client.pan_card_number && client.pan_card_number.toLowerCase().includes(searchTerm));
    });
  }, [clients, debouncedValue]);

  // Check for exact match
  useEffect(() => {
    if (!clients || !value.trim()) {
      setHasExactMatch(false);
      setIsNewClient(false);
      onNewClient?.(false);
      return;
    }

    const exactMatch = clients.find(
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
  }, [value, clients, selectedClientId, onNewClient]);

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
        'HIGH': 'High Risk',
        'MEDIUM': 'Medium Risk', 
        'LOW': 'Low Risk',
        'NONE': 'No Risk'
      };
      const mappedRisk = riskMapping[client.risk_appetite as keyof typeof riskMapping] || 'Medium Risk';
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

  return (
    <div className="relative">
      <Label htmlFor="customerName">{label}</Label>
      <div className="relative">
        <Input
          id="customerName"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          required
          className={hasExactMatch && !selectedClientId ? "border-destructive pr-10" : ""}
        />
        {selectedClientId && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
        )}
      </div>
      
      {/* Status indicators */}
      <div className="mt-1.5 flex items-center gap-2">
        {hasExactMatch && !selectedClientId && (
          <div className="flex items-center gap-1.5 text-destructive text-sm">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Client exists - please select from suggestions</span>
          </div>
        )}
        
        {isNewClient && !hasExactMatch && value.trim().length > 0 && (
          <Badge variant="outline" className="bg-accent text-accent-foreground flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            New buyer will be created
          </Badge>
        )}
        
        {selectedClientId && (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Existing client selected
          </Badge>
        )}
      </div>
      
      {/* Suggestions dropdown */}
      {showSuggestions && filteredClients.length > 0 && (
        <div className="absolute z-50 min-w-[320px] w-max max-w-md mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredClients.map((client) => (
            <HoverCard key={client.id} openDelay={300} closeDelay={100} onOpenChange={(open) => {
              if (open) setHoveredClientId(client.id);
            }}>
              <HoverCardTrigger asChild>
                <div
                  className={`px-3 py-2 hover:bg-muted cursor-pointer ${
                    client.id === selectedClientId ? 'bg-accent' : ''
                  }`}
                  onClick={() => handleClientSelect(client)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium whitespace-nowrap">{client.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {client.client_id}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {client.phone && `Phone: ${client.phone}`}
                    {client.email && ` | Email: ${client.email}`}
                    {client.pan_card_number && ` | PAN: ${client.pan_card_number}`}
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent 
                side="right" 
                align="start" 
                className="w-80 p-3 z-[200] bg-popover border border-border shadow-xl"
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
      )}
      
      {/* No matches found */}
      {showSuggestions && value.trim().length > 0 && filteredClients.length === 0 && !hasExactMatch && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserPlus className="h-4 w-4 text-primary" />
            <span>No existing clients found. A new buyer will be created on submission.</span>
          </div>
        </div>
      )}
    </div>
  );
}
