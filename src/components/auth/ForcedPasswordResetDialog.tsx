
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, ShieldAlert, UserCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ForcedPasswordResetDialogProps {
  open: boolean;
  onSuccess: () => void;
}

export function ForcedPasswordResetDialog({ open, onSuccess }: ForcedPasswordResetDialogProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'password' | 'avatar'>('password');
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);


  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword === 'BlynkTemp2026!') {
      setError('You cannot reuse the temporary password. Please choose a new one.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setError(updateError.message || 'Failed to update password. Please try again.');
        return;
      }

      // Clear the force_password_change flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.from('users').update({ force_password_change: false }).eq('id', user.id);
        setUserId(user.id);
      }

      // Optional next step: profile picture
      setStep('avatar');
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarSelect = (file: File | null) => {
    setError('');
    if (!file) { setAvatarFile(null); setAvatarPreview(null); return; }
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be smaller than 5 MB.'); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !userId) { onSuccess(); return; }
    setUploading(true);
    setError('');
    try {
      const fileExt = avatarFile.name.split('.').pop() || 'jpg';
      const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, avatarFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: rpcError } = await supabase.rpc('update_user_profile', { p_user_id: userId, p_avatar_url: publicUrl });
      if (rpcError) throw rpcError;
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Could not upload the picture. You can add it later from your profile.');
    } finally {
      setUploading(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${step === 'password' ? 'text-destructive' : ''}`}>
            {step === 'password' ? <ShieldAlert className="h-5 w-5" /> : <UserCircle2 className="h-5 w-5" />}
            {step === 'password' ? 'Password Reset Required' : 'Add a Profile Picture (optional)'}
          </DialogTitle>
          <DialogDescription>
            {step === 'password'
              ? 'You are using a temporary password. For security, you must set a new password before continuing.'
              : 'Your password is updated. Add a profile picture so colleagues can recognise you — this is optional and you can do it later from your profile.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'avatar' ? (
          <div className="space-y-4 mt-2">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile preview" className="object-cover w-full h-full" />
                ) : (
                  <UserCircle2 className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="forced-avatar" className="text-xs">Choose an image (max 5 MB)</Label>
                <Input
                  id="forced-avatar"
                  type="file"
                  accept="image/*"
                  className="text-foreground"
                  onChange={(e) => handleAvatarSelect(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onSuccess} disabled={uploading}>
                Skip for now
              </Button>
              <Button type="button" className="flex-1" onClick={handleAvatarUpload} disabled={uploading || !avatarFile}>
                {uploading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>) : 'Save & Continue'}
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleReset} className="space-y-4 mt-2">

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                minLength={8}
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                minLength={8}
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Updating…' : 'Set New Password & Continue'}
          </Button>
        </form>
        )}

      </DialogContent>
    </Dialog>
  );
}
