import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MailX, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Status = 'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = (supabase as any).supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
      headers: { apikey: supabaseKey },
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid === true) setStatus('valid');
        else if (data.reason === 'already_unsubscribed') setStatus('already');
        else setStatus('invalid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (data?.success) setStatus('success');
      else if (data?.reason === 'already_unsubscribed') setStatus('already');
      else setStatus('error');
    } catch {
      setStatus('error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === 'loading' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Validating your request...</p>
            </>
          )}

          {status === 'valid' && (
            <>
              <MailX className="h-10 w-10 text-primary mx-auto" />
              <h2 className="text-xl font-semibold">Unsubscribe from Emails</h2>
              <p className="text-sm text-muted-foreground">
                Click below to stop receiving email notifications from BLYNK Virtual Technologies ERP.
              </p>
              <Button onClick={handleUnsubscribe} disabled={processing} className="mt-2">
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Unsubscribe
              </Button>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold">Unsubscribed</h2>
              <p className="text-sm text-muted-foreground">
                You will no longer receive email notifications.
              </p>
            </>
          )}

          {status === 'already' && (
            <>
              <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto" />
              <h2 className="text-xl font-semibold">Already Unsubscribed</h2>
              <p className="text-sm text-muted-foreground">
                You've already unsubscribed from these notifications.
              </p>
            </>
          )}

          {status === 'invalid' && (
            <>
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Invalid Link</h2>
              <p className="text-sm text-muted-foreground">
                This unsubscribe link is invalid or has expired.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                Please try again later or contact support.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
