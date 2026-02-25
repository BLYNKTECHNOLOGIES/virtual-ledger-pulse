import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Fingerprint,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  isBiometricAvailable,
  checkPlatformAuthenticator,
  registerBiometric,
} from '@/hooks/useWebAuthn';
import { format } from 'date-fns';

interface Credential {
  id: string;
  credential_id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
  sign_count: number;
}

interface BiometricManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  displayName: string;
}

export function BiometricManagementDialog({
  open,
  onOpenChange,
  userId,
  username,
  displayName,
}: BiometricManagementDialogProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [hasPlatformAuth, setHasPlatformAuth] = useState<boolean | null>(null);

  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_webauthn_credentials', {
        p_user_id: userId,
      });
      if (error) throw error;
      setCredentials((data as Credential[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch credentials:', err);
      toast.error('Failed to load biometric credentials');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      fetchCredentials();
      checkPlatformAuthenticator().then(setHasPlatformAuth);
      setShowAddForm(false);
      setDeviceName('');
    }
  }, [open, fetchCredentials]);

  const handleAdd = async () => {
    setIsAdding(true);
    try {
      await registerBiometric(userId, username, deviceName || undefined);
      toast.success('Biometric credential registered successfully');
      setShowAddForm(false);
      setDeviceName('');
      await fetchCredentials();
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error(
          'Registration was cancelled or blocked. Try on the published domain.'
        );
      } else {
        toast.error(err.message || 'Failed to register biometric credential');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (credId: string, credDeviceName: string | null) => {
    if (
      !window.confirm(
        `Remove biometric credential "${credDeviceName || 'Unknown Device'}" from ${displayName}?`
      )
    )
      return;

    setDeletingId(credId);
    try {
      const { error } = await supabase.rpc('delete_webauthn_credential', {
        p_credential_id: credId,
      });
      if (error) throw error;
      toast.success('Credential removed');
      await fetchCredentials();
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error('Failed to remove credential');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        `Remove ALL biometric credentials for ${displayName}? They will need to re-register.`
      )
    )
      return;

    setIsLoading(true);
    try {
      const { error } = await supabase.rpc(
        'delete_all_user_webauthn_credentials',
        { p_user_id: userId }
      );
      if (error) throw error;
      toast.success('All credentials removed');
      await fetchCredentials();
    } catch (err: any) {
      console.error('Delete all error:', err);
      toast.error('Failed to remove credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            Biometric Management
          </DialogTitle>
          <DialogDescription>
            Manage fingerprint credentials for{' '}
            <span className="font-medium text-foreground">{displayName}</span> (@
            {username})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Credentials List */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              Registered Credentials
            </h4>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchCredentials}
                disabled={isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
              <Fingerprint className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No biometric credentials registered
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {cred.device_name || 'Unknown Device'}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>
                          Added {format(new Date(cred.created_at), 'MMM d, yyyy')}
                        </span>
                        {cred.last_used_at && (
                          <>
                            <span>•</span>
                            <span>
                              Last used{' '}
                              {format(new Date(cred.last_used_at), 'MMM d, yyyy')}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span>Uses: {cred.sign_count}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cred.id, cred.device_name)}
                    disabled={deletingId === cred.id}
                  >
                    {deletingId === cred.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Credential */}
          {showAddForm ? (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/5">
              {hasPlatformAuth === false && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>No platform authenticator detected on this device.</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="new-device-name" className="text-xs">
                  Device Name (optional)
                </Label>
                <Input
                  id="new-device-name"
                  placeholder="e.g. MacBook Pro, Office PC"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowAddForm(false);
                    setDeviceName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleAdd}
                  disabled={isAdding}
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-3 w-3" />
                      Register
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 flex-1"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Credential
              </Button>
              {credentials.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={handleDeleteAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove All
                </Button>
              )}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground/60">
            <Badge variant="outline" className="text-[10px] mr-1">
              {credentials.length}
            </Badge>
            credential{credentials.length !== 1 ? 's' : ''} registered
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
