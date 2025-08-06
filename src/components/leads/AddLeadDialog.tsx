
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const contactChannels = [
  { value: "WHATSAPP", label: "WhatsApp", placeholder: "Enter WhatsApp number" },
  { value: "DIRECT_CALL", label: "Direct Call", placeholder: "Enter calling number" },
  { value: "BINANCE_CHAT", label: "Binance Chat", placeholder: "Enter Binance UID" }
];

const leadTypes = [
  { value: "BUY", label: "Buy" },
  { value: "SELL", label: "Sell" }
];

export function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    contact_number: "",
    estimated_order_value: "",
    lead_type: "",
    contact_channel: "",
    contact_channel_value: "",
    price_quoted: "",
    follow_up_date: "",
    follow_up_notes: "",
    description: ""
  });
  const { toast } = useToast();

  // Fetch clients for autocomplete
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
    client.name.toLowerCase().includes(formData.name.toLowerCase())
  ) || [];

  const selectedContactChannel = contactChannels.find(ch => ch.value === formData.contact_channel);

  const handleClientSelect = (client: any) => {
    setFormData(prev => ({ ...prev, name: client.name }));
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('leads')
        .insert([{
          name: formData.name,
          contact_number: formData.contact_number,
          estimated_order_value: Number(formData.estimated_order_value) || 0,
          lead_type: formData.lead_type,
          contact_channel: formData.contact_channel,
          contact_channel_value: formData.contact_channel_value,
          price_quoted: Number(formData.price_quoted) || 0,
          follow_up_date: formData.follow_up_date || null,
          follow_up_notes: formData.follow_up_notes,
          description: formData.description
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead added successfully",
      });

      setFormData({
        name: "",
        contact_number: "",
        estimated_order_value: "",
        lead_type: "",
        contact_channel: "",
        contact_channel_value: "",
        price_quoted: "",
        follow_up_date: "",
        follow_up_notes: "",
        description: ""
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add lead",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" />
          New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 relative">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }));
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Enter lead/client name"
              required
            />
            
            {showSuggestions && filteredClients.length > 0 && formData.name.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredClients.map((client) => (
                  <div
                    key={client.id}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleClientSelect(client)}
                  >
                    <div className="font-medium">{client.name}</div>
                    <div className="text-sm text-gray-500">
                      Type: {client.client_type} | Risk: {client.risk_appetite}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact">Contact Number</Label>
            <Input
              id="contact"
              value={formData.contact_number}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead_type">Lead Type *</Label>
              <Select value={formData.lead_type} onValueChange={(value) => setFormData(prev => ({ ...prev, lead_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {leadTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="value">EOV (Estimated Order Value)</Label>
              <Input
                id="value"
                type="number"
                value={formData.estimated_order_value}
                onChange={(e) => setFormData(prev => ({ ...prev, estimated_order_value: e.target.value }))}
                placeholder="Enter estimated value"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact_channel">Contact Channel</Label>
            <Select value={formData.contact_channel} onValueChange={(value) => setFormData(prev => ({ ...prev, contact_channel: value, contact_channel_value: "" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select contact channel" />
              </SelectTrigger>
              <SelectContent>
                {contactChannels.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {formData.contact_channel && (
            <div className="space-y-2">
              <Label htmlFor="contact_channel_value">
                {selectedContactChannel?.label} Details
              </Label>
              <Input
                id="contact_channel_value"
                value={formData.contact_channel_value}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_channel_value: e.target.value }))}
                placeholder={selectedContactChannel?.placeholder}
              />
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price_quoted">Price Quoted</Label>
              <Input
                id="price_quoted"
                type="number"
                step="0.01"
                value={formData.price_quoted}
                onChange={(e) => setFormData(prev => ({ ...prev, price_quoted: e.target.value }))}
                placeholder="Enter quoted price"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="follow_up_date">Follow-up Date</Label>
              <Input
                id="follow_up_date"
                type="date"
                value={formData.follow_up_date}
                onChange={(e) => setFormData(prev => ({ ...prev, follow_up_date: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="follow_up_notes">Follow-up Notes</Label>
            <Textarea
              id="follow_up_notes"
              value={formData.follow_up_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, follow_up_notes: e.target.value }))}
              rows={2}
              placeholder="Enter follow-up notes"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Lead</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
