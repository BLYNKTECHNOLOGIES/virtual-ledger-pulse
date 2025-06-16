
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, RefreshCw } from "lucide-react";

interface OrderTypeSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderTypeSelected: (type: 'repeat' | 'new') => void;
}

export function OrderTypeSelectionDialog({ 
  open, 
  onOpenChange, 
  onOrderTypeSelected 
}: OrderTypeSelectionDialogProps) {
  
  const handleOrderTypeSelection = (type: 'repeat' | 'new') => {
    onOrderTypeSelected(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Order Type</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" 
                onClick={() => handleOrderTypeSelection('repeat')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5 text-green-600" />
                Repeat Order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Select an existing client from searchable dropdown (by name, ID, or platform)
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleOrderTypeSelection('new')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-blue-600" />
                New Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Create a new client with manual form entry (Name, Phone, Platform, etc.)
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
