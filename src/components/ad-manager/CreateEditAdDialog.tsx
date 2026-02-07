import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Minus } from 'lucide-react';
import { BinanceAd, usePostAd, useUpdateAd, useBinancePaymentMethods } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';

interface CreateEditAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAd?: BinanceAd | null;
}

const PAYMENT_TIME_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
];

export function CreateEditAdDialog({ open, onOpenChange, editingAd }: CreateEditAdDialogProps) {
  const { toast } = useToast();
  const postAd = usePostAd();
  const updateAd = useUpdateAd();
  const { data: paymentMethodsData } = useBinancePaymentMethods();
  const isEditing = !!editingAd;

  const [form, setForm] = useState({
    tradeType: 'SELL',
    asset: 'USDT',
    fiatUnit: 'INR',
    priceType: 1 as 1 | 2,
    price: '',
    priceFloatingRatio: '',
    initAmount: '',
    minSingleTransAmount: '',
    maxSingleTransAmount: '',
    autoReplyMsg: '',
    remarks: '',
    payTimeLimit: 15,
    onlineNow: false,
    buyerRegDaysLimit: 0,
    buyerBtcPositionLimit: 0,
    takerAdditionalKycRequired: 0,
    selectedPayMethods: [] as Array<{ payId: number; payType: string; identifier: string }>,
  });

  useEffect(() => {
    if (editingAd) {
      setForm({
        tradeType: editingAd.tradeType || 'SELL',
        asset: editingAd.asset || 'USDT',
        fiatUnit: editingAd.fiatUnit || 'INR',
        priceType: (editingAd.priceType || 1) as 1 | 2,
        price: String(editingAd.price || ''),
        priceFloatingRatio: String(editingAd.priceFloatingRatio || ''),
        initAmount: String(editingAd.initAmount || ''),
        minSingleTransAmount: String(editingAd.minSingleTransAmount || ''),
        maxSingleTransAmount: String(editingAd.maxSingleTransAmount || ''),
        autoReplyMsg: editingAd.autoReplyMsg || '',
        remarks: editingAd.remarks || '',
        payTimeLimit: editingAd.payTimeLimit || 15,
        onlineNow: editingAd.advStatus === 1,
        buyerRegDaysLimit: editingAd.buyerRegDaysLimit || 0,
        buyerBtcPositionLimit: editingAd.buyerBtcPositionLimit || 0,
        takerAdditionalKycRequired: editingAd.takerAdditionalKycRequired || 0,
        selectedPayMethods: editingAd.tradeMethods || [],
      });
    } else {
      setForm({
        tradeType: 'SELL',
        asset: 'USDT',
        fiatUnit: 'INR',
        priceType: 1,
        price: '',
        priceFloatingRatio: '',
        initAmount: '',
        minSingleTransAmount: '',
        maxSingleTransAmount: '',
        autoReplyMsg: '',
        remarks: '',
        payTimeLimit: 15,
        onlineNow: false,
        buyerRegDaysLimit: 0,
        buyerBtcPositionLimit: 0,
        takerAdditionalKycRequired: 0,
        selectedPayMethods: [],
      });
    }
  }, [editingAd, open]);

  const validate = (): string | null => {
    if (!form.initAmount || Number(form.initAmount) <= 0) return 'Total quantity is required';
    if (!form.minSingleTransAmount || Number(form.minSingleTransAmount) <= 0) return 'Min order limit is required';
    if (!form.maxSingleTransAmount || Number(form.maxSingleTransAmount) <= 0) return 'Max order limit is required';
    if (Number(form.minSingleTransAmount) >= Number(form.maxSingleTransAmount)) return 'Min order must be less than max order';
    if (form.priceType === 1 && (!form.price || Number(form.price) <= 0)) return 'Price is required for fixed type';
    if (form.priceType === 2 && (!form.priceFloatingRatio || Number(form.priceFloatingRatio) === 0)) return 'Floating ratio is required';
    if (form.selectedPayMethods.length === 0) return 'At least one payment method is required';
    return null;
  };

  const handleSubmit = () => {
    const error = validate();
    if (error) {
      toast({ title: 'Validation Error', description: error, variant: 'destructive' });
      return;
    }

    const adData: Record<string, any> = {
      asset: form.asset,
      fiatUnit: form.fiatUnit,
      tradeType: form.tradeType,
      priceType: form.priceType,
      initAmount: Number(form.initAmount),
      minSingleTransAmount: Number(form.minSingleTransAmount),
      maxSingleTransAmount: Number(form.maxSingleTransAmount),
      tradeMethods: form.selectedPayMethods,
      payTimeLimit: form.payTimeLimit,
      onlineNow: form.onlineNow,
      buyerRegDaysLimit: form.buyerRegDaysLimit,
      buyerBtcPositionLimit: form.buyerBtcPositionLimit,
      takerAdditionalKycRequired: form.takerAdditionalKycRequired,
    };

    if (form.priceType === 1) {
      adData.price = Number(form.price);
    } else {
      adData.priceFloatingRatio = Number(form.priceFloatingRatio);
    }

    if (form.autoReplyMsg) adData.autoReplyMsg = form.autoReplyMsg;
    if (form.remarks) adData.remarks = form.remarks;

    if (isEditing && editingAd) {
      adData.advNo = editingAd.advNo;
      updateAd.mutate(adData, { onSuccess: () => onOpenChange(false) });
    } else {
      postAd.mutate(adData, { onSuccess: () => onOpenChange(false) });
    }
  };

  const adjustPrice = (delta: number) => {
    const current = Number(form.price) || 0;
    setForm({ ...form, price: String(Math.max(0, current + delta)) });
  };

  const availablePayMethods = paymentMethodsData?.data || [];

  const togglePayMethod = (method: { payId: number; payType: string; identifier: string }) => {
    const exists = form.selectedPayMethods.find(m => m.payId === method.payId);
    if (exists) {
      setForm({ ...form, selectedPayMethods: form.selectedPayMethods.filter(m => m.payId !== method.payId) });
    } else if (form.selectedPayMethods.length < 5) {
      setForm({ ...form, selectedPayMethods: [...form.selectedPayMethods, method] });
    } else {
      toast({ title: 'Limit Reached', description: 'Maximum 5 payment methods allowed', variant: 'destructive' });
    }
  };

  const isSubmitting = postAd.isPending || updateAd.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Ad' : 'Create New Ad'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trade Type & Asset */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Trade Type</Label>
              <Select value={form.tradeType} onValueChange={(v) => setForm({ ...form, tradeType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Asset</Label>
              <Select value={form.asset} onValueChange={(v) => setForm({ ...form, asset: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="BNB">BNB</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fiat Currency</Label>
              <Select value={form.fiatUnit} onValueChange={(v) => setForm({ ...form, fiatUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price Section */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Price</Label>
            <Select value={String(form.priceType)} onValueChange={(v) => setForm({ ...form, priceType: Number(v) as 1 | 2 })}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Fixed</SelectItem>
                <SelectItem value="2">Floating</SelectItem>
              </SelectContent>
            </Select>

            {form.priceType === 1 ? (
              <div>
                <Label>Price ({form.fiatUnit})</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" type="button" onClick={() => adjustPrice(-0.5)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="text-center"
                  />
                  <Button variant="outline" size="icon" type="button" onClick={() => adjustPrice(0.5)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Label>Floating Ratio (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.priceFloatingRatio}
                  onChange={(e) => setForm({ ...form, priceFloatingRatio: e.target.value })}
                  placeholder="e.g., 1.5 for 1.5% above market"
                />
              </div>
            )}
          </div>

          {/* Total Amount */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Total Trading Amount</Label>
            <div>
              <Label>Total Quantity ({form.asset})</Label>
              <Input
                type="number"
                value={form.initAmount}
                onChange={(e) => setForm({ ...form, initAmount: e.target.value })}
                placeholder="e.g., 5000"
              />
            </div>

            <Label>Order Limit ({form.fiatUnit})</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  value={form.minSingleTransAmount}
                  onChange={(e) => setForm({ ...form, minSingleTransAmount: e.target.value })}
                  placeholder="Min"
                />
                <span className="text-xs text-muted-foreground">Min Order</span>
              </div>
              <div>
                <Input
                  type="number"
                  value={form.maxSingleTransAmount}
                  onChange={(e) => setForm({ ...form, maxSingleTransAmount: e.target.value })}
                  placeholder="Max"
                />
                <span className="text-xs text-muted-foreground">Max Order</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Payment Method</Label>
            <div className="flex flex-wrap gap-2">
              {form.selectedPayMethods.map((m) => (
                <Badge key={m.payId} variant="default" className="gap-1 cursor-pointer" onClick={() => togglePayMethod(m)}>
                  {m.payType || m.identifier}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
            {Array.isArray(availablePayMethods) && availablePayMethods.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availablePayMethods
                  .filter((m: any) => !form.selectedPayMethods.find(s => s.payId === m.id))
                  .map((m: any) => (
                    <Badge
                      key={m.id}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => togglePayMethod({ payId: m.id, payType: m.tradeMethodName || m.payType, identifier: m.identifier || '' })}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {m.tradeMethodName || m.payType}
                    </Badge>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No payment methods loaded. They will be fetched from Binance.</p>
            )}
            <p className="text-xs text-muted-foreground">Select up to 5 methods</p>

            <div>
              <Label>Payment Time Limit</Label>
              <Select value={String(form.payTimeLimit)} onValueChange={(v) => setForm({ ...form, payTimeLimit: Number(v) })}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TIME_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Terms and Conditions</Label>
            <div>
              <Label>Remarks (Optional)</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="A 1% Tax Deducted at Source (TDS) will be deducted under Section 194S..."
                rows={3}
              />
            </div>
            <div>
              <Label>Auto Reply (Optional)</Label>
              <Textarea
                value={form.autoReplyMsg}
                onChange={(e) => setForm({ ...form, autoReplyMsg: e.target.value })}
                placeholder="Auto reply message sent when order is created"
                rows={2}
              />
            </div>
          </div>

          {/* Counterparty Conditions */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Counterparty Conditions</Label>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.takerAdditionalKycRequired === 1}
                onCheckedChange={(checked) => setForm({ ...form, takerAdditionalKycRequired: checked ? 1 : 0 })}
              />
              <Label>Request additional verification</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Registered days ago</Label>
                <Input
                  type="number"
                  value={form.buyerRegDaysLimit}
                  onChange={(e) => setForm({ ...form, buyerRegDaysLimit: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Holdings more than (BTC)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={form.buyerBtcPositionLimit}
                  onChange={(e) => setForm({ ...form, buyerBtcPositionLimit: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Status</Label>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">{form.onlineNow ? 'Online' : 'Offline'}</span>
              <Switch
                checked={form.onlineNow}
                onCheckedChange={(checked) => setForm({ ...form, onlineNow: checked })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
