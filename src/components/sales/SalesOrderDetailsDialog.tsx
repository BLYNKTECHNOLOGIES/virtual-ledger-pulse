
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { ArrowUpRight, Download, Landmark, Printer, Receipt, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import {
  Callout,
  Chip,
  CopyButton,
  DialogBody,
  DialogFoot,
  DialogHead,
  Facts,
  OrderNo,
  SalesStatusChip,
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

interface SalesOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function SalesOrderDetailsDialog({ open, onOpenChange, order }: SalesOrderDetailsDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canViewClient = hasPermission('clients_view') || hasPermission('clients_manage');

  const openClientPage = () => {
    if (!canViewClient || !order?.client_id) return;
    onOpenChange(false);
    navigate(`/clients/${order.client_id}`);
  };

  // Fetch wallet details if wallet_id exists
  const { data: walletData } = useQuery({
    queryKey: ['wallet_for_order', order?.wallet_id],
    queryFn: async () => {
      if (!order?.wallet_id) return null;
      const { data: wallet } = await supabase
        .from('wallets')
        .select('wallet_name, chain_name, current_balance')
        .eq('id', order.wallet_id)
        .single();
      return wallet;
    },
    enabled: !!order?.wallet_id && open,
  });

  // Fetch bank account details if sales_payment_method_id exists
  const { data: bankAccountData } = useQuery({
    queryKey: ['bank_account_for_order', order?.sales_payment_method_id],
    queryFn: async () => {
      if (!order?.sales_payment_method_id) return null;
      const { data: paymentMethod } = await supabase
        .from('sales_payment_methods')
        .select('bank_account_id')
        .eq('id', order.sales_payment_method_id)
        .single();
      if (!paymentMethod?.bank_account_id) return null;
      const { data: bankAccount } = await supabase
        .from('bank_accounts')
        .select('account_name, bank_name, account_number')
        .eq('id', paymentMethod.bank_account_id)
        .single();
      return bankAccount;
    },
    enabled: !!order?.sales_payment_method_id && open,
  });

  // Fetch creator username if created_by exists
  const { data: creatorData } = useQuery({
    queryKey: ['sales_order_creator', order?.created_by],
    queryFn: async () => {
      if (!order?.created_by) return null;
      const { data: user } = await usersDirectory()
        .select('username')
        .eq('id', order.created_by)
        .single();
      return user;
    },
    enabled: !!order?.created_by && open,
  });

  // Fetch product code if product_id exists
  const { data: productData } = useQuery({
    queryKey: ['product_for_order', order?.product_id],
    queryFn: async () => {
      if (!order?.product_id) return null;
      const { data } = await supabase
        .from('products')
        .select('code, name')
        .eq('id', order.product_id)
        .single();
      return data;
    },
    enabled: !!order?.product_id && open,
  });

  // Fetch payment splits if is_split_payment
  const { data: paymentSplits } = useQuery({
    queryKey: ['sales_order_payment_splits', order?.id],
    queryFn: async () => {
      if (!order?.id) return null;
      const { data } = await supabase
        .from('sales_order_payment_splits')
        .select('id, amount, bank_account_id, payment_method_id, is_gateway, created_at, bank_accounts:bank_account_id(account_name, bank_name), sales_payment_methods:payment_method_id(nickname, type, payment_gateway)')
        .eq('sales_order_id', order.id)
        .order('created_at');
      return data;
    },
    enabled: !!order?.id && !!order?.is_split_payment && open,
  });

  if (!order) return null;

  const assetCode = productData?.code || 'USDT';
  const isNonUsdt = assetCode !== 'USDT';
  const storedMarketRate = order?.market_rate_usdt ? Number(order.market_rate_usdt) : null;

  const handleDownloadPDF = () => {
    try {
      const pdf = generateInvoicePDF({ 
        order, 
        bankAccountData: order.payment_status === 'COMPLETED' ? bankAccountData : undefined 
      });
      pdf.save(`Invoice_${order.order_number}.pdf`);
      toast({ title: "Success", description: "Invoice PDF downloaded successfully" });
    } catch (error) {
      toast({ title: "Error", description: `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
    }
  };

  const handlePrintPDF = () => {
    try {
      const pdf = generateInvoicePDF({ 
        order, 
        bankAccountData: order.payment_status === 'COMPLETED' ? bankAccountData : undefined 
      });
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
      toast({ title: "Success", description: "Invoice sent to printer" });
    } catch (error) {
      toast({ title: "Error", description: `Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
    }
  };

  /* ── Presentation only ─────────────────────────────────────────────────── */

  // While the lookups above load, show what the order row already carries (the list's
  // embeds) instead of a placeholder; once loaded, the lookups win exactly as before.
  // Undefined data = the lookup is still running; null = it found nothing.
  const assetLabel = productData?.code || order.product?.code || assetCode;
  const productLabel = productData?.name || order.product?.name || assetLabel;
  const walletLabel =
    walletData?.wallet_name || order.wallet?.wallet_name || (order.wallet_id && walletData === undefined ? "Loading…" : "—");
  const creatorLabel =
    creatorData?.username || order.created_by_user?.username || (order.created_by && creatorData === undefined ? "Loading…" : "—");
  const orderNumberText = String(order.order_number ?? "").trim();

  const customerName = canViewClient && order.client_id ? (
    <button
      type="button"
      onClick={openClientPage}
      title="Open client page"
      className="inline-flex max-w-full items-start gap-1 text-left font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none"
    >
      <span className="min-w-0 break-words">{order.client_name}</span>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    </button>
  ) : (
    order.client_name || "—"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass("lg")}>
        <DialogHead
          icon={Receipt}
          title="Sales order details"
          description={order.client_name || "Customer not recorded"}
          meta={
            <>
              <SalesStatusChip status={order.payment_status} />
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <span className="sr-only">Order number</span>
                <OrderNo value={order.order_number} className="break-all" />
                <CopyButton value={orderNumberText} label="Copy order number" />
              </span>
            </>
          }
        />

        <DialogBody className={DETAILS_BODY}>
          {/* What was sold, at what price */}
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Order total</div>
            <div className="mt-0.5 text-2xl font-semibold leading-8 tracking-tight tabular-nums text-foreground">
              {fmtInr(order.total_amount)}
            </div>
            <div className="text-[13px] tabular-nums text-muted-foreground">
              {fmtAssetQty(order.quantity || 1, assetLabel)} @ {fmtRate(order.price_per_unit || order.total_amount)}
            </div>
          </div>

          {order.cosmos_alert && (
            <Callout tone="danger" icon={ShieldAlert}>
              COSMOS alert was triggered for this order.
            </Callout>
          )}

          <Section title="Order">
            <Facts
              cols={3}
              items={[
                { label: "Order number", value: <OrderNo value={order.order_number} className="break-all" /> },
                { label: "Order date", value: fmtDate(order.order_date) },
                { label: "Wallet", value: walletLabel },
                { label: "Product", value: productLabel },
                { label: "Created by", value: creatorLabel },
                { label: "Created at", value: <span className="tabular-nums">{fmtDateTime(order.created_at)}</span> },
              ]}
            />
          </Section>

          <Section title="Customer">
            <Facts
              cols={3}
              items={[
                { label: "Name", value: customerName },
                { label: "Phone", value: <span className="tabular-nums">{order.client_phone || "—"}</span> },
                order.client_state ? { label: "State", value: order.client_state } : null,
              ]}
            />
          </Section>

          {(order.fee_amount > 0 || order.fee_percentage > 0) && (
            <Section title="Amounts" boxed bodyClassName="py-1.5 sm:py-2">
              <SummaryRow label="Platform fee" value={fmtAssetQty(order.fee_amount || 0, "USDT", 4)} />
              <SummaryRow label="Fee rate" value={`${Number(order.fee_percentage || 0).toFixed(2)}%`} />
            </Section>
          )}

          {/* USDT equivalent for non-USDT coins (rate stored when the order was approved) */}
          {isNonUsdt && storedMarketRate && storedMarketRate > 0 && (() => {
            const qty = Number(order.quantity || 1);
            const totalAmt = Number(order.total_amount || 0);
            const usdtEquivQty = qty * storedMarketRate;
            const equivUsdtRate = usdtEquivQty > 0 ? totalAmt / usdtEquivQty : 0;
            return (
              <Section title="USDT equivalent" actions={<Chip tone="neutral">Snapshot</Chip>}>
                <Facts
                  cols={3}
                  items={[
                    { label: `${assetCode}/USDT rate`, value: <span className="tabular-nums">{fmtQty(storedMarketRate, 6)}</span> },
                    { label: "Equivalent USDT qty", value: <span className="tabular-nums">{fmtQty(usdtEquivQty, 4)}</span> },
                    { label: "Equivalent USDT rate", value: <span className="tabular-nums">{fmtRate(equivUsdtRate)}</span> },
                  ]}
                />
              </Section>
            );
          })()}

          {(bankAccountData || (order.is_split_payment && paymentSplits && paymentSplits.length > 0)) && (
            <Section title="Payment">
              <div className="space-y-4">
                {bankAccountData && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">Received in</div>
                    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
                      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <div className="break-words text-[13px] font-medium leading-5 text-foreground">{bankAccountData.account_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {bankAccountData.bank_name}
                          <span className="mx-1.5" aria-hidden>·</span>
                          <span className="font-mono text-[12px] tabular-nums text-foreground/80">
                            {bankAccountData.account_number ? `****${bankAccountData.account_number.slice(-4)}` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {order.is_split_payment && paymentSplits && paymentSplits.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      Split payment · {paymentSplits.length} {paymentSplits.length === 1 ? "part" : "parts"}
                    </div>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                      {paymentSplits.map((split: any) => (
                        <li key={split.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="break-words text-[13px] font-medium text-foreground">
                              {split.sales_payment_methods?.nickname || split.bank_accounts?.account_name || 'Unknown'}
                            </span>
                            {!split.sales_payment_methods?.nickname && split.bank_accounts?.bank_name && (
                              <span className="text-xs text-muted-foreground">{split.bank_accounts?.bank_name}</span>
                            )}
                            {split.is_gateway && <Chip tone="neutral">POS/Gateway</Chip>}
                          </div>
                          <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-foreground">{fmtInr(split.amount)}</span>
                        </li>
                      ))}
                      <li className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2">
                        <span className="text-[13px] font-semibold text-foreground">Total</span>
                        <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                          {fmtInr(paymentSplits.reduce((sum: number, s: any) => sum + Number(s.amount), 0))}
                        </span>
                      </li>
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

          {/* Activity timeline for completed/cancelled orders */}
          {(order.payment_status === 'COMPLETED' || order.status === 'CANCELLED') && (
            <ActivityTimeline
              entityId={order.id}
              entityType="sales_order"
              title="Activity history"
              className="bg-card"
            />
          )}
        </DialogBody>

        <DialogFoot>
          <Button type="button" variant="outline" onClick={handlePrintPDF} className="flex-auto sm:flex-none">
            <Printer className="h-4 w-4" />
            Print invoice
          </Button>
          <Button type="button" onClick={handleDownloadPDF} className="flex-auto sm:flex-none">
            <Download className="h-4 w-4" />
            Download invoice PDF
          </Button>
        </DialogFoot>
      </DialogContent>
    </Dialog>
  );
}
