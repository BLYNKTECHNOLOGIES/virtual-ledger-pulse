
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onRiskLevelChange?: (riskLevel: string) => void;
}

export function CustomerAutocomplete({ value, onChange, onRiskLevelChange }: CustomerAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  const filteredClients = clients?.filter(client => 
    client.name.toLowerCase().includes(value.toLowerCase())
  ) || [];

  const handleClientSelect = (client: any) => {
    onChange(client.name);
    if (onRiskLevelChange) {
      onRiskLevelChange(client.default_risk_level || 'MEDIUM');
    }
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Enter customer name"
      />
      
      {showSuggestions && filteredClients.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => handleClientSelect(client)}
            >
              <div className="font-medium">{client.name}</div>
              <div className="text-sm text-gray-500">
                Risk: {client.default_risk_level} | Type: {client.client_type}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
