import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { ArrowUpRight, Download, Landmark, Printer, ShoppingBag } from "lucide-react";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { TransactionActorsCard } from "@/components/purchase/TransactionActorsCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCoinMarketRate } from "@/hooks/useCoinMarketRate";
import {
  Chip,
  CopyButton,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  OrderNo,
  PurchaseStatusChip,
  Section,
  SummaryRow,
  dialogContentClass,
  fmtAssetQty,
  fmtDate,
  fmtDateTime,
  fmtInr,
  fmtQty,
  fmtRate,
} from "@/components/orders-ui";

import { usersDirectory } from "@/lib/usersDirectory";

// Below 768px the app's global CSS forces every <h3> to 16px (index.css, mobile text block);
// keep the kit's 11px section headings inside this dialog. Presentation only.
const DETAILS_BODY = "[&_h3]:!text-[11px]";

const PAYOUT_GATEWAY_FEE_CATEGORY = 'Finance, Banking & Compliance > Payout Gateway Fee';

interface PurchaseOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function PurchaseOrderDetailsDialog({ open, onOpenChange, order }: PurchaseOrderDetailsDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canViewClient = hasPermission('clients_view') || hasPermission('clients_manage');

  // Resolve the client to deep-link the supplier name to the client page.
  // Dedup is phone-based, so prefer the phone match; fall back to a unique
  // name match when the order carries no phone number.
  const supplierPhone = (order?.contact_number || '').toString().trim();
  const supplierName = (order?.supplier_name || '').toString().trim();
  const { data: linkedClient } = useQuery({
    queryKey: ['po_client_link', supplierPhone, supplierName],
    queryFn: async () => {
      if (supplierPhone) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('phone', supplierPhone)
          .maybeSingle();
        if (data?.id) return data;
      }
      if (supplierName) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .ilike('name', supplierName)
          .limit(2);
        // Only link when the name resolves to exactly one client.
        if (data && data.length === 1) return data[0];
      }
      return null;
    },
    enabled: open && canViewClient && (!!supplierPhone || !!supplierName),
  });

  const openClientPage = () => {
    if (!canViewClient || !linkedClient?.id) return;
    onOpenChange(false);
    navigate(`/clients/${linkedClient.id}`);
  };

  // Resolve platform (wallet) name. Deep-link fetches don't join the wallet
  // relation, so resolve it here from wallet_id / warehouse_id when missing.
  const walletIdForPlatform = order?.wallet_id || order?.purchase_order_items?.[0]?.warehouse_id || null;
  const { data: platformWallet } = useQuery({
    queryKey: ['po_platform_wallet', walletIdForPlatform],
    queryFn: async () => {
      const { data } = await supabase
        .from('wallets')
        .select('wallet_name')
        .eq('id', walletIdForPlatform)
        .maybeSingle();
      return data;
    },
    enabled: open && !order?.wallet?.wallet_name && !order?.is_off_market && !!walletIdForPlatform,
  });

  const platformName = order?.is_off_market
    ? 'Off Market'
    : (order?.wallet?.wallet_name || platformWallet?.wallet_name || 'N/A');

  // Fetch creator's username if created_by exists
  const { data: creatorUser } = useQuery({
    queryKey: ['user', order?.created_by],
    queryFn: async () => {
      if (!order?.created_by) return null;
      const { data, error } = await usersDirectory()
        .select('id, username')
        .eq('id', order.created_by)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!order?.created_by,
  });

  // Fetch bank account details for single payment
  const { data: bankAccount } = useQuery({
    queryKey: ['bank_account_detail', order?.bank_account_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .eq('id', order.bank_account_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!order?.bank_account_id,
  });

  // Fetch split payment details (separate queries to avoid ambiguous FK with bank_accounts view)
  const { data: paymentSplits } = useQuery({
    queryKey: ['payment_splits', order?.id],
    queryFn: async () => {
      const { data: splits, error } = await supabase
        .from('purchase_order_payment_splits')
        .select('id, amount, bank_account_id')
        .eq('purchase_order_id', order.id);
      if (error || !splits?.length) return [];

      // Fetch bank account details separately
      const bankIds = [...new Set(splits.map(s => s.bank_account_id))];
      const { data: banks } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .in('id', bankIds);

      const bankMap = new Map((banks || []).map(b => [b.id, b]));
      return splits.map(s => ({
        ...s,
        bank_accounts: bankMap.get(s.bank_account_id) || null,
      }));
    },
    enabled: !!order?.id,
  });

  const { data: payoutGatewayFees = [] } = useQuery({
    queryKey: ['purchase_payout_gateway_fees', order?.order_number],
    queryFn: async () => {
      const { data: feeRows, error } = await supabase
        .from('bank_transactions')
        .select('id, amount, bank_account_id, category, description, transaction_date')
        .eq('reference_number', order.order_number)
        .eq('transaction_type', 'EXPENSE');
      if (error || !feeRows?.length) return [];

      const payoutFeeRows = feeRows.filter((row: any) =>
        row.category === PAYOUT_GATEWAY_FEE_CATEGORY ||
        String(row.description || '').toLowerCase().includes('payout gateway fee')
      );
      if (!payoutFeeRows.length) return [];

      const bankIds = [...new Set(payoutFeeRows.map((row: any) => row.bank_account_id).filter(Boolean))];
      const { data: banks } = bankIds.length
        ? await supabase
          .from('bank_accounts')
          .select('id, account_name, bank_name, account_number')
          .in('id', bankIds)
        : { data: [] } as any;

      const bankMap = new Map((banks || []).map((bank: any) => [bank.id, bank]));
      return payoutFeeRows.map((row: any) => ({
        ...row,
        bank_accounts: bankMap.get(row.bank_account_id) || null,
      }));
    },
    enabled: !!order?.order_number,
  });

  // Get product code for this order
  const productCode = order?.product_category || order?.purchase_order_items?.[0]?.products?.code || 'USDT';
  const isNonUsdt = productCode !== 'USDT';

  // Use stored market_rate_usdt (snapshot at approval time), fall back to live CoinUSDT rate
  const storedMarketRate = order?.market_rate_usdt ? Number(order.market_rate_usdt) : null;
  const [liveCoinRate, setLiveCoinRate] = useState<number | null>(null);

  useEffect(() => {
    if (open && isNonUsdt && !storedMarketRate) {
      fetchCoinMarketRate(productCode).then(rate => setLiveCoinRate(rate));
    }
  }, [open, isNonUsdt, storedMarketRate, productCode]);

  const effectiveRate = storedMarketRate || liveCoinRate;
  const isLiveRate = !storedMarketRate && !!liveCoinRate;
  const payoutGatewayFeeTotal = payoutGatewayFees.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

  if (!order) return null;

  const orderForPdf = {
    ...order,
    client_name: order.supplier_name,
    client_phone: order.contact_number,
  };


  const handleDownloadPDF = () => {
    try {
      const pdf = generateInvoicePDF({ order: orderForPdf });
      pdf.save(`Purchase_${order.order_number}.pdf`);
      toast({ title: "Success", description: "Receipt PDF downloaded" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handlePrintPDF = () => {
    try {
      const pdf = generateInvoicePDF({ order: orderForPdf });
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
      toast({ title: "Success", description: "Receipt sent to printer" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to print PDF", variant: "destructive" });
    }
  };

  /* ── Presentation only ─────────────────────────────────────────────────── */

  const orderNumberText = String(order.order_number ?? "").trim();
  // Undefined data = the lookup is still running; null = it found nothing.
  const creatorLabel =
    creatorUser?.username || order.created_by_user?.username || (creatorUser === undefined ? "Loading…" : "—");
  const platformLabel =
    platformName !== 'N/A'
      ? platformName
      : walletIdForPlatform && platformWallet === undefined
        ? "Loading…"
        : "—";
  const productName = order.product_name || order.purchase_order_items?.[0]?.products?.name || "—";
  const productCodeLabel = order.product_category || order.purchase_order_items?.[0]?.products?.code;
  const showProductCode = productCodeLabel && productCodeLabel !== productName;

  const showFee = !order.off_market && (order.fee_amount > 0 || order.fee_percentage > 0);
  const tdsAmount = Number(order.tds_amount || 0);
  const showTds = !!order.tds_applied || tdsAmount > 0;
  const tdsRate = Number(order.total_amount) > 0 ? (tdsAmount / Number(order.total_amount)) * 100 : null;
  const hasSplits = !!paymentSplits && paymentSplits.length > 0;
  const splitTotal = hasSplits ? paymentSplits.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0) : 0;

  const bankLine = (bank: any) =>
    bank ? (
      <>
        {bank.bank_name}
        {bank.account_number && (
          <>
            <span className="mx-1.5" aria-hidden>·</span>
            <span className="font-mono text-[12px] tabular-nums text-foreground/80">{bank.account_number}</span>
          </>
        )}
      </>
    ) : null;

  const supplierLink = canViewClient && linkedClient?.id ? (
    <button
      type="button"
      onClick={openClientPage}
      title="Open client page"
      className="inline-flex max-w-full items-start gap-1 text-left font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
    >
      <span className="min-w-0 break-words">{order.supplier_name}</span>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    </button>
  ) : (
    order.supplier_name || "—"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={ShoppingBag}
          title="Purchase order details"
          description={order.supplier_name || "Supplier not recorded"}
          meta={
            <>
              <PurchaseStatusChip status={order.status} />
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <span className="sr-only">Order number</span>
                <OrderNo value={order.order_number} className="break-all" />
                <CopyButton value={orderNumberText} label="Copy order number" />
              </span>
            </>
          }
        />

        <DialogBody className={DETAILS_BODY}>
          {/* What was bought, at what price */}
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Order total</div>
            <div className="mt-0.5 text-2xl font-semibold leading-8 tracking-tight tabular-nums text-foreground">
              {fmtInr(order.total_amount)}
            </div>
            <div className="text-[13px] tabular-nums text-muted-foreground">
              {fmtAssetQty(order.quantity || 1, productCode)} @ {fmtRate(order.price_per_unit || order.total_amount)}
            </div>
          </div>

          <Section title="Order">
            <Facts
              cols={3}
              items={[
                { label: "Order number", value: <OrderNo value={order.order_number} className="break-all" /> },
                { label: "Order date", value: fmtDate(order.order_date) },
                { label: "Platform", value: platformLabel },
                { label: "Product", value: productName, hint: showProductCode ? productCodeLabel : undefined },
                order.created_by ? { label: "Created by", value: creatorLabel } : null,
                { label: "Assigned to", value: order.assigned_to || "Unassigned" },
                { label: "Created at", value: <span className="tabular-nums">{fmtDateTime(order.created_at)}</span> },
                { label: "Updated at", value: <span className="tabular-nums">{fmtDateTime(order.updated_at)}</span> },
              ]}
            />
          </Section>

          <Section title="Supplier">
            <Facts
              cols={3}
              items={[
                { label: "Name", value: supplierLink },
                { label: "Phone", value: <span className="tabular-nums">{order.contact_number || "—"}</span> },
                order.pan_number ? { label: "PAN", value: order.pan_number, mono: true } : null,
                order.client_state ? { label: "State", value: order.client_state } : null,
              ]}
            />
          </Section>

          {(showFee || showTds) && (
            <Section title="Amounts" boxed bodyClassName="py-1.5 sm:py-2">
              {showFee && (
                <>
                  <SummaryRow label="Platform fee" value={fmtAssetQty(order.fee_amount || 0, "USDT", 4)} />
                  <SummaryRow label="Fee rate" value={`${Number(order.fee_percentage || 0).toFixed(2)}%`} />
                </>
              )}
              {showTds && (
                <>
                  <SummaryRow
                    label="Order total"
                    value={fmtInr(order.total_amount)}
                    className={showFee ? "mt-1 border-t border-border/60 pt-2.5" : undefined}
                  />
                  <SummaryRow
                    label="TDS"
                    hint={tdsRate !== null ? `${Number(tdsRate.toFixed(2))}% of order total` : undefined}
                    value={`−${fmtInr(tdsAmount)}`}
                  />
                  <SummaryRow
                    label="Net payable"
                    value={order.net_payable_amount != null ? fmtInr(order.net_payable_amount) : "—"}
                    strong
                  />
                </>
              )}
            </Section>
          )}

          {/* USDT equivalent for non-USDT coins: stored snapshot, else the live rate */}
          {isNonUsdt && effectiveRate && effectiveRate > 0 && (() => {
            const qty = Number(order.quantity || 1);
            const totalAmt = Number(order.total_amount || 0);
            const usdtEquivQty = qty * effectiveRate;
            const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
            return (
              <Section
                title="USDT equivalent"
                actions={isLiveRate ? <Chip tone="warning">Live rate</Chip> : <Chip tone="neutral">Snapshot</Chip>}
              >
                <Facts
                  cols={3}
                  items={[
                    { label: `${productCode}/USDT rate`, value: <span className="tabular-nums">{fmtQty(effectiveRate, 6)}</span> },
                    { label: "Equivalent USDT qty", value: <span className="tabular-nums">{fmtQty(usdtEquivQty, 4)}</span> },
                    { label: "Equivalent USDT rate", value: <span className="tabular-nums">{fmtRate(equivUsdtRate)}</span> },
                  ]}
                />
              </Section>
            );
          })()}

          {(hasSplits || bankAccount || payoutGatewayFees.length > 0) && (
            <Section title="Payment">
              <div className="space-y-4">
                {hasSplits ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      {paymentSplits.length > 1 ? `Split payment · ${paymentSplits.length} accounts` : "Paid from"}
                    </div>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                      {paymentSplits.map((split: any) => (
                        <li key={split.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0">
                              <div className="break-words text-[13px] font-medium leading-5 text-foreground">
                                {(split.bank_accounts as any)?.account_name || 'Unknown'}
                              </div>
                              {split.bank_accounts && <div className="text-xs text-muted-foreground">{bankLine(split.bank_accounts)}</div>}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{fmtInr(split.amount)}</span>
                        </li>
                      ))}
                      {paymentSplits.length > 1 && (
                        <li className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2">
                          <span className="text-[13px] font-semibold text-foreground">Total</span>
                          <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{fmtInr(splitTotal)}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : bankAccount ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">Paid from</div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <div className="break-words text-[13px] font-medium leading-5 text-foreground">{bankAccount.account_name}</div>
                          <div className="text-xs text-muted-foreground">{bankLine(bankAccount)}</div>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{fmtInr(order.total_amount)}</span>
                    </div>
                  </div>
                ) : null}

                {payoutGatewayFees.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Payout gateway fee · {payoutGatewayFees.length} {payoutGatewayFees.length === 1 ? "entry" : "entries"}
                    </div>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                      {payoutGatewayFees.map((fee: any) => (
                        <li key={fee.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium leading-5 text-foreground">
                                {fee.bank_accounts?.account_name || 'Bank account not found'}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {fee.bank_accounts ? bankLine(fee.bank_accounts) : fee.description}
                              </div>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{fmtInr(fee.amount)}</span>
                        </li>
                      ))}
                      {payoutGatewayFees.length > 1 && (
                        <li className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2">
                          <span className="text-[13px] font-semibold text-foreground">Total fee</span>
                          <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{fmtInr(payoutGatewayFeeTotal)}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {order.description && (
            <Section title="Description">
              <p className="whitespace-pre-wrap text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]">{order.description}</p>
            </Section>
          )}

          {/* Who did what, for closed orders */}
          {(order.status === 'COMPLETED' || order.status === 'CANCELLED' || order.status === 'EXPIRED') && (
            <div className="space-y-3">
              <TransactionActorsCard
                orderId={order.id}
                orderStatus={order.status}
              />

              <ActivityTimeline
                entityId={order.id}
                entityType="purchase_order"
                title="Full activity log"
                className="bg-card"
              />
            </div>
          )}
        </DialogBody>

        <DialogFoot>
          <Button type="button" variant="outline" onClick={handlePrintPDF} className="flex-auto sm:flex-none">
            <Printer className="h-4 w-4" />
            Print receipt
          </Button>
          <Button type="button" onClick={handleDownloadPDF} className="flex-auto sm:flex-none">
            <Download className="h-4 w-4" />
            Download receipt PDF
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}
