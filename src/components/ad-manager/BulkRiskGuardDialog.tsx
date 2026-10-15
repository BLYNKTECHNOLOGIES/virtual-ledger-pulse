import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, ShieldAlert } from 'lucide-react';
import { BinanceAd, useApplyAdRiskGuard } from '@/hooks/useBinanceAds';
import { AdDialogHeader, NoteBox, SelectionSummary } from './adUi';

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
    // Group ads by their owning account so combined-mode batches route correctly.
    const byAccount = new Map<string | undefined, string[]>();
    for (const ad of ads) {
      const key = ad._exchangeAccountId;
      byAccount.set(key, [...(byAccount.get(key) || []), ad.advNo]);
    }
    const groups = Array.from(byAccount.entries());
    let remaining = groups.length;
    if (remaining === 0) { onComplete(); return; }
    for (const [accountId, advNos] of groups) {
      applyRiskGuard.mutate({
        advNos,
        profileName: 'Manual Risk Guard',
        riskPayload,
        exchangeAccountId: accountId,
      }, {
        onSuccess: () => { remaining -= 1; if (remaining === 0) onComplete(); },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <AdDialogHeader icon={ShieldAlert} tone="warning" title="Apply risk guard" description="Sets counterparty rules on every selected ad. The KYC switch is always applied, on or off; empty fields are left unchanged." />

        <SelectionSummary ads={ads} />

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">Require additional taker KYC</span>
              <span className="block text-xs text-muted-foreground">Counterparties must complete Binance's extra verification.</span>
            </span>
            <Switch checked={extraKyc} onCheckedChange={setExtraKyc} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Minimum account age days</Label>
              <Input type="number" min="0" value={regDays} onChange={(e) => setRegDays(e.target.value)} className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum BTC holding</Label>
              <Input type="number" min="0" step="0.001" value={btcHolding} onChange={(e) => setBtcHolding(e.target.value)} placeholder="Not changed" className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>Max single order</Label>
              <Input type="number" min="0" value={maxOrder} onChange={(e) => setMaxOrder(e.target.value)} placeholder="Not changed" className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>Payment time limit</Label>
              <Input type="number" min="1" value={payTimeLimit} onChange={(e) => setPayTimeLimit(e.target.value)} className="tabular-nums" />
            </div>
          </div>

          <NoteBox tone="info">
            This sends only Binance-supported ad update fields. Unsupported fields are skipped and logged.
          </NoteBox>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={submit} disabled={applyRiskGuard.isPending} className="gap-1.5">
            {applyRiskGuard.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {applyRiskGuard.isPending ? 'Applying...' : `Apply to ${ads.length} ad${ads.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}