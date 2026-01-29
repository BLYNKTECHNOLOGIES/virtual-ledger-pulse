import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Unlock } from 'lucide-react';

interface PinProtectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  pinCode: string;
  onSuccess: () => void;
}

export function PinProtectionDialog({
  open,
  onOpenChange,
  groupName,
  pinCode,
  onSuccess,
}: PinProtectionDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setPin('');
      setError(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pin === pinCode) {
      onSuccess();
      onOpenChange(false);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin('');
      inputRef.current?.focus();
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setPin(value);
    setError(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="p-3 bg-primary/10 rounded-full">
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Enter PIN to Access</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium text-foreground">{groupName}</span> is protected.
            <br />
            Enter the 8-digit PIN to unlock.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`transition-transform ${shake ? 'animate-shake' : ''}`}>
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={handlePinChange}
              placeholder="Enter 8-digit PIN"
              className={`text-center text-xl tracking-[0.5em] font-mono ${
                error ? 'border-destructive focus-visible:ring-destructive' : ''
              }`}
              autoComplete="off"
            />
            {error && (
              <p className="text-sm text-destructive text-center mt-2">
                Incorrect PIN. Please try again.
              </p>
            )}
          </div>
          
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pin.length !== 8}
              className="flex-1 gap-2"
            >
              <Unlock className="h-4 w-4" />
              Unlock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
