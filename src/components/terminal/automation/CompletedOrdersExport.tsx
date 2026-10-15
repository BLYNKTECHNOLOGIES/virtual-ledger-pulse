import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  FileDown,
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  Search,
  SearchX,
  Table2,
} from 'lucide-react';
import { format, subDays, subHours, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { toast } from 'sonner';
import { Field, HINT, InlineNotice, NUM, Panel, PanelHead, PanelState, SCROLL_BOX, SectionHead, ShimmerRows, SideChip, Stat, TD, TH, TH_STICKY, UNIT } from './automationUi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ExportFormat = 'csv' | 'pdf';
type PresetRange = '24h' | '7d' | '30d' | 'custom';

interface CompletedOrder {
  order_number: string;
  verified_name: string | null;
  counter_part_nick_name: string;
  trade_type: string;
  asset: string;
  amount: string;
  unit_price: string;
  total_price: string;
  create_time: number;
}

const COMPLETED_STATUSES = ['COMPLETED', '4', 'completed'];

export function CompletedOrdersExport() {
  const [preset, setPreset] = useState<PresetRange>('7d');
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 7));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [allOrders, setAllOrders] = useState<CompletedOrder[]>([]);
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [minTotal, setMinTotal] = useState<string>('');
  const [maxTotal, setMaxTotal] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [missingVerifiedNames, setMissingVerifiedNames] = useState(0);

  // Apply client-side filters
  const orders = useMemo(() => {
    let filtered = allOrders;
    if (tradeTypeFilter !== 'ALL') {
      filtered = filtered.filter(o => o.trade_type === tradeTypeFilter);
    }
    const min = parseFloat(minTotal);
    const max = parseFloat(maxTotal);
    if (!isNaN(min)) {
      filtered = filtered.filter(o => parseFloat(o.total_price || '0') >= min);
    }
    if (!isNaN(max)) {
      filtered = filtered.filter(o => parseFloat(o.total_price || '0') <= max);
    }
    return filtered;
  }, [allOrders, tradeTypeFilter, minTotal, maxTotal]);

  const handlePresetChange = (value: PresetRange) => {
    setPreset(value);
    setIsFetched(false);
    const now = new Date();
    switch (value) {
      case '24h': setFromDate(subHours(now, 24)); setToDate(now); break;
      case '7d': setFromDate(subDays(now, 7)); setToDate(now); break;
      case '30d': setFromDate(subDays(now, 30)); setToDate(now); break;
      case 'custom': break;
    }
  };

  const fetchCompletedOrders = async () => {
    setIsLoading(true);
    setIsFetched(false);
    try {
      const fromTs = startOfDay(fromDate).getTime();
      const toTs = endOfDay(toDate).getTime();

      // Fetch from DB with pagination to bypass 1000-row limit
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('binance_order_history')
          .select('order_number, verified_name, counter_part_nick_name, trade_type, asset, amount, unit_price, total_price, create_time, order_status')
          .gte('create_time', fromTs)
          .lte('create_time', toTs)
          .order('create_time', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Filter only completed
      const completed = allRows.filter(o =>
        COMPLETED_STATUSES.some(s => String(o.order_status).toUpperCase().includes(s.toUpperCase()))
      );

      setAllOrders(completed);
      setMissingVerifiedNames(completed.filter(o => !o.verified_name).length);
      setIsFetched(true);

      if (completed.length === 0) {
        toast.info('No completed orders found for the selected period');
      }
    } catch (err: any) {
      toast.error(`Failed to fetch orders: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const enrichVerifiedNames = async () => {
    const missing = orders.filter(o => !o.verified_name);
    if (missing.length === 0) return;

    setIsExporting(true);
    let enriched = 0;
    const BATCH = 5; // fetch 5 at a time to avoid rate limits

    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (o) => {
          try {
            const resp = await callBinanceAds('getOrderDetail', { orderNumber: o.order_number });
            const d = resp?.data || resp;
            // For our SELL orders, counterparty is buyer; for our BUY orders, counterparty is seller
            const realName = (o.trade_type === 'SELL' ? (d?.buyerName || d?.buyerRealName) : (d?.sellerName || d?.sellerRealName)) || d?.buyerName || d?.sellerName || null;
            if (realName) {
              // Update DB
              await supabase
                .from('binance_order_history')
                .update({ verified_name: realName })
                .eq('order_number', o.order_number);
              return { orderNumber: o.order_number, name: realName };
            }
            return null;
          } catch {
            return null;
          }
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          enriched++;
          const idx = orders.findIndex(o => o.order_number === r.value!.orderNumber);
          if (idx >= 0) orders[idx].verified_name = r.value.name;
        }
      }
      // Rate limit delay
      if (i + BATCH < missing.length) await new Promise(r => setTimeout(r, 500));
    }

    setAllOrders([...allOrders]);
    setMissingVerifiedNames(allOrders.filter(o => !o.verified_name).length);
    setIsExporting(false);
    if (enriched > 0) toast.success(`Enriched ${enriched} verified names`);
  };

  const getDisplayName = (o: CompletedOrder) => o.verified_name || o.counter_part_nick_name || '—';

  const generateCSV = async () => {
    const headers = ['Order Number', 'Verified Name', 'Order Type', 'Asset', 'Quantity', 'Price', 'Total Amount', 'Completion Timestamp'];
    const BATCH = 2000;
    const csvParts: string[] = [headers.join(',')];

    for (let i = 0; i < orders.length; i += BATCH) {
      const batch = orders.slice(i, i + BATCH);
      const batchLines = batch.map(o => [
        o.order_number,
        getDisplayName(o),
        o.trade_type,
        o.asset,
        o.amount,
        o.unit_price,
        o.total_price,
        format(new Date(o.create_time), 'yyyy-MM-dd HH:mm:ss'),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      csvParts.push(...batchLines);
      // Yield to UI thread
      await new Promise(r => setTimeout(r, 10));
    }

    const blob = new Blob([csvParts.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `completed_orders_${format(fromDate, 'yyyyMMdd')}_${format(toDate, 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${orders.length} orders as CSV`);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });

    // Dark background styling
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), 'F');

    // Header
    doc.setTextColor(245, 197, 24); // Binance yellow
    doc.setFontSize(18);
    doc.text('Completed Orders Report', 14, 20);

    doc.setTextColor(160, 160, 160);
    doc.setFontSize(9);
    doc.text(`Period: ${format(fromDate, 'dd MMM yyyy')} – ${format(toDate, 'dd MMM yyyy')}`, 14, 28);
    doc.text(`Total Orders: ${orders.length}`, 14, 34);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 40);

    const totalVolume = orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
    doc.text(`Total Volume: ₹${totalVolume.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 14, 46);

    // Table
    const headers = ['Order Number', 'Verified Name', 'Type', 'Asset', 'Quantity', 'Price (₹)', 'Total (₹)', 'Completed At'];
    const rows = orders.map(o => [
      o.order_number,
      getDisplayName(o),
      o.trade_type,
      o.asset,
      parseFloat(o.amount).toFixed(2),
      parseFloat(o.unit_price).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      parseFloat(o.total_price).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      format(new Date(o.create_time), 'dd MMM yy HH:mm'),
    ]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 52,
      theme: 'grid',
      styles: {
        fillColor: [25, 25, 25],
        textColor: [200, 200, 200],
        lineColor: [50, 50, 50],
        lineWidth: 0.1,
        fontSize: 7,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [40, 40, 40],
        textColor: [245, 197, 24],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: {
        fillColor: [30, 30, 30],
      },
      columnStyles: {
        0: { cellWidth: 45 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      didDrawPage: (data) => {
        // Footer on each page
        doc.setFillColor(17, 17, 17);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7);
        doc.text(
          `P2P Trading Operations · Page ${doc.getCurrentPageInfo().pageNumber}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      },
    });

    doc.save(`completed_orders_${format(fromDate, 'yyyyMMdd')}_${format(toDate, 'yyyyMMdd')}.pdf`);
    toast.success(`Exported ${orders.length} orders as PDF`);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'csv') await generateCSV();
      else generatePDF();
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const buyCount = orders.filter(o => o.trade_type === 'BUY').length;
  const sellCount = orders.filter(o => o.trade_type === 'SELL').length;
  const totalVol = orders.reduce((s, o) => s + parseFloat(o.total_price || '0'), 0);

  const volumeText = totalVol >= 100000 ? (totalVol / 100000).toFixed(1) + 'L' : totalVol.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      {/* Configuration */}
      <Panel labelledBy="ex-title">
        <SectionHead
          icon={<FileDown />}
          title="Export completed orders"
          titleId="ex-title"
          description="Fetch the completed P2P orders of a period, check them below, then download a CSV or PDF. Order type and amount filters narrow the fetched rows without fetching again."
        />
        <div className="px-4 py-3">
          {/* Range, format and filters — every label sits above its control */}
          <div className="grid grid-cols-2 items-end gap-3 @[36rem]:grid-cols-4 @[64rem]:grid-cols-[repeat(7,minmax(0,10rem))_auto]">
            {/* Preset */}
            <Field label={<span id="ex-period-label">Period</span>} htmlFor="ex-period" className="col-span-2 @[36rem]:col-span-1">
              <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetRange)}>
                <SelectTrigger id="ex-period" aria-labelledby="ex-period-label" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* From Date */}
            <Field label="From" htmlFor="ex-from">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="ex-from"
                    variant="outline"
                    size="sm"
                    aria-label={`From ${format(fromDate, 'dd MMM yyyy')}`}
                    className={cn("h-8 w-full justify-start gap-1.5 bg-[hsl(var(--input))] px-2.5 text-xs font-normal [&_svg]:size-3.5", !fromDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="text-muted-foreground" />
                    {format(fromDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 t-scale-in" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => { if (d) { setFromDate(d); setPreset('custom'); setIsFetched(false); } }}
                    disabled={(d) => d > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            {/* To Date */}
            <Field label="To" htmlFor="ex-to">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="ex-to"
                    variant="outline"
                    size="sm"
                    aria-label={`To ${format(toDate, 'dd MMM yyyy')}`}
                    className={cn("h-8 w-full justify-start gap-1.5 bg-[hsl(var(--input))] px-2.5 text-xs font-normal [&_svg]:size-3.5", !toDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="text-muted-foreground" />
                    {format(toDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 t-scale-in" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => { if (d) { setToDate(d); setPreset('custom'); setIsFetched(false); } }}
                    disabled={(d) => d > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            {/* Format */}
            <Field label={<span id="ex-format-label">Format</span>} htmlFor="ex-format">
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger id="ex-format" aria-labelledby="ex-format-label" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <span className="flex items-center gap-1.5"><FileSpreadsheet className="h-3 w-3" /> CSV</span>
                  </SelectItem>
                  <SelectItem value="pdf">
                    <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> PDF</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Trade Type Filter */}
            <Field label={<span id="ex-type-label">Order Type</span>} htmlFor="ex-type">
              <Select value={tradeTypeFilter} onValueChange={(v) => setTradeTypeFilter(v as 'ALL' | 'BUY' | 'SELL')}>
                <SelectTrigger id="ex-type" aria-labelledby="ex-type-label" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Min Total — the ₹ sits next to the box, not inside it (shared rule for number inputs) */}
            <Field label="Min Total (₹)" htmlFor="ex-min">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={UNIT}>₹</span>
                <Input
                  id="ex-min"
                  type="number"
                  placeholder="0"
                  value={minTotal}
                  onChange={(e) => setMinTotal(e.target.value)}
                  className="h-8 min-w-0 text-sm t-mono tabular-nums placeholder:font-sans"
                />
              </div>
            </Field>

            {/* Max Total */}
            <Field label="Max Total (₹)" htmlFor="ex-max">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={UNIT}>₹</span>
                <Input
                  id="ex-max"
                  type="number"
                  placeholder="No limit"
                  value={maxTotal}
                  onChange={(e) => setMaxTotal(e.target.value)}
                  className="h-8 min-w-0 text-sm t-mono tabular-nums placeholder:font-sans"
                />
              </div>
            </Field>

            {/* Fetch Button — the panel's main action until results are shown; then Export takes over (one filled button) */}
            <Button
              size="sm"
              variant={isFetched ? 'outline' : 'default'}
              className="col-span-2 h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5 @[36rem]:col-span-1"
              onClick={fetchCompletedOrders}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
              {isLoading ? 'Fetching...' : 'Fetch Orders'}
            </Button>
          </div>

          {/* While fetching */}
          {isLoading && (
            <div className="-mx-4 mt-3 border-t border-border">
              <ShimmerRows rows={2} label="Fetching orders…" />
            </div>
          )}

          {/* An earlier result is hidden after the period or a date changes */}
          {!isFetched && !isLoading && allOrders.length > 0 && (
            <p className={`${HINT} mt-3`}>Fetch Orders to load the orders for the selected range.</p>
          )}

          {/* Results summary */}
          {isFetched && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2 @[40rem]:grid-cols-4">
                {/* lower-case in the DOM, sentence case on screen (the journeys read DOM text) */}
                <Stat label={<span className="inline-block first-letter:uppercase">completed orders</span>} value={orders.length.toLocaleString('en-IN')} />
                {/* side colour only when there is something to colour; a 0 stays neutral */}
                <Stat label="Buy" value={buyCount} tone={buyCount > 0 ? 'success' : undefined} />
                <Stat label="Sell" value={sellCount} tone={sellCount > 0 ? 'danger' : undefined} />
                <Stat
                  label="Volume"
                  value={<span title={`₹${totalVol.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}>₹{volumeText}</span>}
                />
                {missingVerifiedNames > 0 && (
                  <InlineNotice tone="warning" title={`${missingVerifiedNames} missing verified names`} className="col-span-full">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span className="min-w-0 flex-1 basis-64">
                        Exports use the Binance nickname for these rows. Enrich looks up the filtered orders on Binance and saves their real names.
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs text-foreground"
                        onClick={enrichVerifiedNames}
                        disabled={isExporting}
                      >
                        Enrich from API
                      </Button>
                    </div>
                  </InlineNotice>
                )}
              </div>

              {/* Narrow panels: helper left-aligned, Export full width (like Fetch Orders above); wide: one right-aligned row */}
              <div className="flex flex-col gap-2 @[36rem]:flex-row @[36rem]:items-center @[36rem]:justify-end @[36rem]:gap-3">
                <p className={HINT}>The file includes every row that matches the filters.</p>
                <Button size="sm" className="h-8 w-full gap-1.5 px-3 text-xs [&_svg]:size-3.5 @[36rem]:w-auto" onClick={handleExport} disabled={isExporting || orders.length === 0}>
                  {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
                  Export {exportFormat.toUpperCase()}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Preview Table */}
      {isFetched && orders.length > 0 && (
        <Panel labelledBy="ex-preview-title">
          <PanelHead
            icon={<Table2 />}
            title={`Preview (${Math.min(orders.length, 200)} of ${orders.length} rows)`}
            titleId="ex-preview-title"
            meta={orders.length > 200 ? 'newest first · the file has every row' : 'newest first'}
          />
          {/* Capped (scrolls inside) only on wide panels; on narrow ones the rows flow with the page and scroll sideways */}
          <div
            className={`${SCROLL_BOX} max-h-none @[52rem]:max-h-[32rem]`}
            tabIndex={0}
            role="region"
            aria-label="Order preview rows"
          >
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className={`${TH} ${TH_STICKY} pl-4`}>Order Number</th>
                  <th className={`${TH} ${TH_STICKY}`}>Verified Name</th>
                  <th className={`${TH} ${TH_STICKY}`}>Type</th>
                  <th className={`${TH} ${TH_STICKY}`}>Asset</th>
                  <th className={`${TH} ${TH_STICKY} text-right`}>Quantity</th>
                  <th className={`${TH} ${TH_STICKY} text-right`}>Price</th>
                  <th className={`${TH} ${TH_STICKY} text-right`}>Total</th>
                  <th className={`${TH} ${TH_STICKY} pr-4`}>Completed At</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 200).map((o) => (
                  <tr key={o.order_number}>
                    <td className={`${TD} ${NUM} pl-4 text-foreground`} title={o.order_number}>…{o.order_number.slice(-10)}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {o.verified_name ? (
                        <span className="text-foreground">{o.verified_name}</span>
                      ) : (
                        <span className="italic text-muted-foreground" title="Binance nickname — no verified name yet">{o.counter_part_nick_name || '—'}</span>
                      )}
                    </td>
                    <td className={TD}>
                      <SideChip side={o.trade_type}>{o.trade_type}</SideChip>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-foreground`}>{o.asset}</td>
                    <td className={`${TD} ${NUM} text-right text-foreground`}>{parseFloat(o.amount).toFixed(2)}</td>
                    <td className={`${TD} ${NUM} text-right text-foreground`}>₹{parseFloat(o.unit_price).toLocaleString('en-IN')}</td>
                    <td className={`${TD} ${NUM} text-right text-foreground`}>₹{parseFloat(o.total_price).toLocaleString('en-IN')}</td>
                    <td className={`${TD} ${NUM} pr-4 text-muted-foreground`}>{format(new Date(o.create_time), 'dd MMM HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Nothing to preview after a fetch */}
      {isFetched && orders.length === 0 && (
        <Panel labelledBy="ex-preview-title">
          <PanelHead icon={<Table2 />} title="Preview" titleId="ex-preview-title" />
          <PanelState
            icon={<SearchX />}
            title={allOrders.length === 0 ? 'No completed orders in this period' : 'No orders match the filters'}
            hint={allOrders.length === 0 ? 'Pick a longer period or other dates, then fetch again.' : 'Change the order type or amount filters to see the fetched orders.'}
          />
        </Panel>
      )}
    </div>
  );
}
