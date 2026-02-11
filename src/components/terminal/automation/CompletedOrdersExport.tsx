import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileDown,
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { format, subDays, subHours, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { toast } from 'sonner';
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

  return (
    <div className="space-y-4">
      {/* Configuration */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileDown className="h-4 w-4 text-primary" />
            Export Completed Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range */}
          <div className="flex flex-wrap items-end gap-3">
            {/* Preset */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</label>
              <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetRange)}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] h-9 text-xs justify-start", !fromDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {format(fromDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => { if (d) { setFromDate(d); setPreset('custom'); setIsFetched(false); } }}
                    disabled={(d) => d > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* To Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] h-9 text-xs justify-start", !toDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {format(toDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => { if (d) { setToDate(d); setPreset('custom'); setIsFetched(false); } }}
                    disabled={(d) => d > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Format</label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger className="w-[120px] h-9 text-xs">
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
            </div>

            {/* Trade Type Filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Order Type</label>
              <Select value={tradeTypeFilter} onValueChange={(v) => setTradeTypeFilter(v as 'ALL' | 'BUY' | 'SELL')}>
                <SelectTrigger className="w-[100px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Total */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Min Total (₹)</label>
              <Input
                type="number"
                placeholder="0"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
                className="w-[110px] h-9 text-xs"
              />
            </div>

            {/* Max Total */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Total (₹)</label>
              <Input
                type="number"
                placeholder="No limit"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
                className="w-[110px] h-9 text-xs"
              />
            </div>

            {/* Fetch Button */}
            <Button size="sm" className="h-9" onClick={fetchCompletedOrders} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              {isLoading ? 'Fetching...' : 'Fetch Orders'}
            </Button>
          </div>

          {/* Results summary */}
          {isFetched && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <Badge variant="secondary" className="text-xs">
                {orders.length.toLocaleString()} completed orders
              </Badge>
              <Badge variant="outline" className="text-xs text-trade-buy">
                {buyCount} Buy
              </Badge>
              <Badge variant="outline" className="text-xs text-trade-sell">
                {sellCount} Sell
              </Badge>
              <Badge variant="outline" className="text-xs">
                ₹{totalVol >= 100000 ? (totalVol / 100000).toFixed(1) + 'L' : totalVol.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Badge>

              {missingVerifiedNames > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {missingVerifiedNames} missing verified names
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={enrichVerifiedNames}
                    disabled={isExporting}
                  >
                    Enrich from API
                  </Button>
                </div>
              )}

              <div className="ml-auto">
                <Button size="sm" className="h-9" onClick={handleExport} disabled={isExporting || orders.length === 0}>
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                  Export {exportFormat.toUpperCase()}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Table */}
      {isFetched && orders.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Preview ({Math.min(orders.length, 200)} of {orders.length} rows)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Order Number</TableHead>
                    <TableHead className="text-[10px]">Verified Name</TableHead>
                    <TableHead className="text-[10px]">Type</TableHead>
                    <TableHead className="text-[10px]">Asset</TableHead>
                    <TableHead className="text-[10px] text-right">Quantity</TableHead>
                    <TableHead className="text-[10px] text-right">Price</TableHead>
                    <TableHead className="text-[10px] text-right">Total</TableHead>
                    <TableHead className="text-[10px]">Completed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 200).map((o) => (
                    <TableRow key={o.order_number}>
                      <TableCell className="font-mono text-xs">…{o.order_number.slice(-10)}</TableCell>
                      <TableCell className="text-xs">
                        {o.verified_name ? (
                          <span className="text-foreground">{o.verified_name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">{o.counter_part_nick_name || '—'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", o.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell')}>
                          {o.trade_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{o.asset}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{parseFloat(o.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">₹{parseFloat(o.unit_price).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">₹{parseFloat(o.total_price).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(o.create_time), 'dd MMM HH:mm')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
