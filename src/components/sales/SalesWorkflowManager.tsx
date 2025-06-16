
import { useState } from "react";
import { NewOrderDialog } from "./NewOrderDialog";
import { OrderAmountDialog } from "./OrderAmountDialog";
import { PaymentMethodDialog } from "./PaymentMethodDialog";
import { OrderActionDialog } from "./OrderActionDialog";
import { FinalSalesEntryDialog } from "./FinalSalesEntryDialog";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SalesWorkflowManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WorkflowStep = 
  | 'order-type' 
  | 'client-selection' 
  | 'new-client-form' 
  | 'amount-entry' 
  | 'payment-method' 
  | 'order-actions' 
  | 'final-entry';

export function SalesWorkflowManager({ open, onOpenChange }: SalesWorkflowManagerProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('order-type');
  const [workflowData, setWorkflowData] = useState<any>({});

  // Fetch platforms for new client form
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const resetWorkflow = () => {
    setCurrentStep('order-type');
    setWorkflowData({});
  };

  const handleOrderTypeSelect = (type: 'repeat' | 'new') => {
    setWorkflowData({ ...workflowData, orderType: type });
    if (type === 'repeat') {
      setCurrentStep('client-selection');
    } else {
      setCurrentStep('new-client-form');
    }
  };

  const handleClientSelect = (clientName: string, riskLevel?: string) => {
    setWorkflowData({ 
      ...workflowData, 
      clientName, 
      clientRiskLevel: riskLevel || 'MEDIUM' 
    });
    setCurrentStep('amount-entry');
  };

  const handleNewClientSubmit = (clientData: any) => {
    setWorkflowData({ 
      ...workflowData, 
      clientName: clientData.clientName,
      clientRiskLevel: clientData.riskLevel || 'MEDIUM',
      platform: clientData.platform
    });
    setCurrentStep('amount-entry');
  };

  const handleAmountConfirm = (amount: number, cosmosAlert: boolean) => {
    setWorkflowData({ 
      ...workflowData, 
      amount, 
      cosmosAlert 
    });
    setCurrentStep('payment-method');
  };

  const handlePaymentMethodSelect = (method: any) => {
    setWorkflowData({ 
      ...workflowData, 
      paymentMethod: method 
    });
    setCurrentStep('order-actions');
  };

  const handleOrderAction = (action: 'cancelled' | 'alternative' | 'received') => {
    if (action === 'cancelled') {
      // TODO: Move to leads
      onOpenChange(false);
      resetWorkflow();
    } else if (action === 'alternative') {
      setCurrentStep('payment-method');
    } else if (action === 'received') {
      setCurrentStep('final-entry');
    }
  };

  const handleFinalEntryComplete = () => {
    onOpenChange(false);
    resetWorkflow();
  };

  const handleClose = () => {
    onOpenChange(false);
    resetWorkflow();
  };

  return (
    <>
      {/* Order Type Selection */}
      <NewOrderDialog
        open={open && currentStep === 'order-type'}
        onOpenChange={handleClose}
        onOrderTypeSelect={handleOrderTypeSelect}
      />

      {/* Client Selection for Repeat Orders */}
      <Dialog open={open && currentStep === 'client-selection'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Existing Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Search Client</Label>
              <CustomerAutocomplete
                value=""
                onChange={(clientName) => {
                  if (clientName) {
                    handleClientSelect(clientName);
                  }
                }}
                onRiskLevelChange={(riskLevel) => {
                  setWorkflowData({ ...workflowData, clientRiskLevel: riskLevel });
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Client Form */}
      <Dialog open={open && currentStep === 'new-client-form'} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Client Details</DialogTitle>
          </DialogHeader>
          <NewClientForm 
            platforms={platforms || []}
            onSubmit={handleNewClientSubmit}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>

      {/* Amount Entry */}
      <OrderAmountDialog
        open={open && currentStep === 'amount-entry'}
        onOpenChange={handleClose}
        clientName={workflowData.clientName}
        onAmountConfirm={handleAmountConfirm}
      />

      {/* Payment Method Selection */}
      <PaymentMethodDialog
        open={open && currentStep === 'payment-method'}
        onOpenChange={handleClose}
        clientRiskLevel={workflowData.clientRiskLevel || 'MEDIUM'}
        orderAmount={workflowData.amount || 0}
        onPaymentMethodSelect={handlePaymentMethodSelect}
      />

      {/* Order Actions */}
      <OrderActionDialog
        open={open && currentStep === 'order-actions'}
        onOpenChange={handleClose}
        paymentMethod={workflowData.paymentMethod}
        onAction={handleOrderAction}
      />

      {/* Final Sales Entry */}
      <FinalSalesEntryDialog
        open={open && currentStep === 'final-entry'}
        onOpenChange={handleFinalEntryComplete}
        orderData={{
          clientName: workflowData.clientName,
          amount: workflowData.amount,
          paymentMethod: workflowData.paymentMethod,
          platform: workflowData.platform
        }}
      />
    </>
  );
}

// New Client Form Component
function NewClientForm({ platforms, onSubmit, onCancel }: any) {
  const [formData, setFormData] = useState({
    clientName: "",
    phone: "",
    platform: "",
    riskLevel: "MEDIUM"
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="clientName">Client Name *</Label>
        <Input
          id="clientName"
          value={formData.clientName}
          onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
          required
        />
      </div>
      
      <div>
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
        />
      </div>
      
      <div>
        <Label htmlFor="platform">Platform</Label>
        <Select onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            {platforms.map((platform: any) => (
              <SelectItem key={platform.id} value={platform.name}>
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label htmlFor="riskLevel">Risk Level</Label>
        <Select onValueChange={(value) => setFormData(prev => ({ ...prev, riskLevel: value }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low Risk</SelectItem>
            <SelectItem value="MEDIUM">Medium Risk</SelectItem>
            <SelectItem value="HIGH">High Risk</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
