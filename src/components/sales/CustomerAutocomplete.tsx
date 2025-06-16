
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onRiskLevelChange: (riskLevel: string) => void;
}

export function CustomerAutocomplete({ value, onChange, onRiskLevelChange }: CustomerAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState("");

  // Fetch clients for auto-suggest
  const { data: clients } = useQuery({
    queryKey: ['clients_for_autocomplete'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('name, risk_appetite')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch default risk level
  const { data: defaultRiskLevel } = useQuery({
    queryKey: ['default_risk_level'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_default_risk_level');
      
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (value && clients) {
      const filtered = clients
        .filter(client => 
          client.name.toLowerCase().includes(value.toLowerCase())
        )
        .map(client => client.name)
        .slice(0, 5);
      
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 && value.length > 0);

      // Check if exact match exists to get risk level
      const exactMatch = clients.find(client => 
        client.name.toLowerCase() === value.toLowerCase()
      );
      
      if (exactMatch) {
        setSelectedRiskLevel(exactMatch.risk_appetite);
        onRiskLevelChange(exactMatch.risk_appetite);
      } else {
        // Use default risk level for new customers
        const defaultLevel = defaultRiskLevel || 'MEDIUM';
        setSelectedRiskLevel(defaultLevel);
        onRiskLevelChange(defaultLevel);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedRiskLevel("");
      onRiskLevelChange("");
    }
  }, [value, clients, defaultRiskLevel, onRiskLevelChange]);

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Label htmlFor="customerName">Customer Name *</Label>
        <Input
          id="customerName"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Start typing customer name..."
          required
        />
        
        {showSuggestions && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRiskLevel && (
        <div>
          <Label>Risk Level (from Client Profile)</Label>
          <div className="mt-1">
            <Badge className={getRiskLevelColor(selectedRiskLevel)}>
              {selectedRiskLevel}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
