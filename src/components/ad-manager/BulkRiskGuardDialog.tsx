import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { BinanceAd, useApplyAdRiskGuard } from '@/hooks/useBinanceAds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

export function BulkRiskGuardDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const applyRiskGuard = useApplyAdRiskGuard();
  const [extraKyc, setExtraKyc] = useState(true);
  const [regDays, setRegDays] = useState('30');
  const [btcHolding, setBtcHolding] = useState('');
  const [maxOrder, setMaxOrder] = useState('');
  const [payTimeLimit, setPayTimeLimit] = useState('15');

  const reset = () => {
    setExtraKyc(true);
    setRegDays('30');
    setBtcHolding('');
    setMaxOrder('');
    setPayTimeLimit('15');
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && applyRiskGuard.isSuccess) onComplete();
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const riskPayload: Record<string, any> = {
    buyerKycLimit: 1,
    takerAdditionalKycRequired: extraKyc ? 1 : 0,
  };
  if (regDays !== '') riskPayload.buyerRegDaysLimit = Number(regDays);
  if (btcHolding !== '') riskPayload.buyerBtcPositionLimit = Number(btcHolding);
  if (maxOrder !== '') riskPayload.maxSingleTransAmount = Number(maxOrder);
  if (payTimeLimit !== '') riskPayload.payTimeLimit = Number(payTimeLimit);

  const submit = () => {
    applyRiskGuard.mutate({
      advNos: ads.map((ad) => ad.advNo),
      profileName: 'Manual Risk Guard',
      riskPayload,
    }, { onSuccess: () => onComplete() });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Apply Risk Guard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <p className="text-muted-foreground">
              This sends only Binance-supported ad update fields. Unsupported fields are skipped and logged.
            </p>
          </div>

          <Badge variant="secondary">{ads.length} selected ad{ads.length !== 1 ? 's' : ''}</Badge>

          <div className="flex items-center justify-between rounded border p-3">
            <Label>Require additional taker KYC</Label>
            <Switch checked={extraKyc} onCheckedChange={setExtraKyc} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Minimum account age days</Label>
              <Input type="number" min="0" value={regDays} onChange={(e) => setRegDays(e.target.value)} />
            </div>
            <div>
              <Label>Minimum BTC holding</Label>
              <Input type="number" min="0" step="0.001" value={btcHolding} onChange={(e) => setBtcHolding(e.target.value)} placeholder="Not changed" />
            </div>
            <div>
              <Label>Max single order</Label>
              <Input type="number" min="0" value={maxOrder} onChange={(e) => setMaxOrder(e.target.value)} placeholder="Not changed" />
            </div>
            <div>
              <Label>Payment time limit</Label>
              <Input type="number" min="1" value={payTimeLimit} onChange={(e) => setPayTimeLimit(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={submit} disabled={applyRiskGuard.isPending}>
            {applyRiskGuard.isPending ? 'Applying...' : 'Apply Risk Guard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}