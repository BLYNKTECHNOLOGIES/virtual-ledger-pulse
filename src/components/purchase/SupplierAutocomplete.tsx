import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SupplierAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onContactChange?: (contact: string) => void;
}

export function SupplierAutocomplete({ value, onChange, onContactChange }: SupplierAutocompleteProps) {
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
    if (onContactChange && client.phone) {
      onContactChange(client.phone);
    }
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Label htmlFor="supplierName">Supplier Name *</Label>
      <Input
        id="supplierName"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Enter supplier name"
        required
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
                {client.phone && `Phone: ${client.phone}`}
                {client.email && ` | Email: ${client.email}`}
                {client.client_type && ` | Type: ${client.client_type}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}