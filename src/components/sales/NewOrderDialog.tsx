
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus } from "lucide-react";

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderTypeSelect: (type: 'repeat' | 'new') => void;
}

export function NewOrderDialog({ open, onOpenChange, onOrderTypeSelect }: NewOrderDialogProps) {
  const handleOrderTypeSelect = (type: 'repeat' | 'new') => {
    onOrderTypeSelect(type);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Order Type</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 gap-4">
          <Card className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => handleOrderTypeSelect('repeat')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-lg">
                <Users className="h-6 w-6 text-blue-600" />
                Repeat Order ✅
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Choose from existing clients with order history</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => handleOrderTypeSelect('new')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-lg">
                <UserPlus className="h-6 w-6 text-green-600" />
                New Client ➕
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Create order for a new client</p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
