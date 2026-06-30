/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BLYNK Virtual Technologies'

interface AssetRow { asset: string; qty: string; value: string; count: number }
interface DailyReportProps {
  date?: string
  isMonthly?: boolean
  periodLabel?: string
  periodStart?: string
  periodEnd?: string
  pnl?: {
    grossProfit: string; netProfit: string; avgSalesRate: string;
    effectivePurchaseRate: string; npm: string; totalFees: string; netProfitPositive: boolean
  }
  sales?: { totalQty: string; totalValue: string; orderCount: number; totalOrders: number; avgTicket: string; byAsset: AssetRow[] }
  purchases?: { totalQty: string; totalValue: string; orderCount: number; totalOrders: number; avgTicket: string; byAsset: AssetRow[] }
  wallet?: { balances: { asset: string; balance: string }[]; feesByType: { type: string; amount: string }[]; totalFees: string }
  expenses?: { totalExpenses: string; count: number; byCategory: { category: string; amount: string }[]; list: { category: string; description: string; amount: string }[] }
  shifts?: { key: string; label: string; window: string; purchaseQty: string; purchaseValue: string; purchaseCount: number; avgPurchaseRate: string; salesQty: string; salesValue: string; salesCount: number; avgSalesRate: string }[]
  platformRates?: { platform: string; avgBuyRate: string; buyCount: number; avgSellRate: string; sellCount: number }[]
  stats?: { busiestHour: string; totalOrders: number; completedOrders: number; topClients: { name: string; value: string }[]; salesChangePct: string; purchaseChangePct: string }

  assetValue?: {
    total: string; totalPositive: boolean;
    totalBank: string; totalGateway: string; stockVal: string; totalUnpaidTds: string;
    bankCount: number; pendingCount: number; tdsCount: number;
    assetStocks: { asset: string; units: string; avgCost: string; value: string }[];
    gatewayGroups: { name: string; total: string; count: number }[];
  }
  charts?: { salesVsPurchase: string; pnl: string; volumeByAsset: string; hourly: string; expensesByCategory?: string }
  kyc?: { newClients: number; approvedToday: number; pendingTotal: number }
  rejected?: { count: number; rows: { type: string; label: string; amount: string; counterparty: string; reason: string; rejectedBy: string; rejectedAt: string }[] }
  erpDiff?: { count: number; capturedAt: string | null; rows: { account: string; erp: string; terminal: string; difference: string; hasDrift: boolean; status: string }[] }




}

const formatDate = (d?: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''

const DailyBusinessReport = ({ date, isMonthly, periodLabel, periodStart, periodEnd, pnl, sales, purchases, wallet, expenses, shifts, platformRates, stats, assetValue, charts, kyc, rejected, erpDiff }: DailyReportProps) => {
  const reportKind = isMonthly ? 'Monthly Business Report' : 'Daily Business Report'
  const periodTitle = isMonthly ? (periodLabel || formatDate(periodStart)) : formatDate(date)
  const introText = isMonthly
    ? `Full-month summary (${formatDate(periodStart)} – ${formatDate(periodEnd)}, IST) of P&\u00A0L, sales, purchases, wallet balances and key statistics.`
    : 'Full-day summary (12:00 AM – 12:00 AM IST) of P&\u00A0L, sales, purchases, wallet balances and key statistics.'
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${reportKind} — ${periodTitle}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Text style={headerText}>{SITE_NAME}</Text>
          <Text style={headerSub}>{reportKind}</Text>
        </Section>

        <Section style={content}>
          <Heading style={h1}>Report for {periodTitle}</Heading>
          <Text style={text}>{introText}</Text>

          {/* KPI cards */}
          {pnl && (
            <Section>
              <div style={kpiRow}>
                <div style={{ ...kpiCard, borderColor: '#B87333' }}>
                  <Text style={kpiLabel}>Gross Profit</Text>
                  <Text style={kpiValue}>₹{pnl.grossProfit}</Text>
                </div>
                <div style={{ ...kpiCard, borderColor: pnl.netProfitPositive ? '#2E7D32' : '#C62828' }}>
                  <Text style={kpiLabel}>Net Profit</Text>
                  <Text style={{ ...kpiValue, color: pnl.netProfitPositive ? '#2E7D32' : '#C62828' }}>₹{pnl.netProfit}</Text>
                </div>
              </div>
            </Section>
          )}

          {/* Total Asset Value (from Financials tab) */}
          {assetValue && (
            <Section>
              <div style={{ ...kpiCard, display: 'block', width: 'auto', borderColor: '#4F46E5', backgroundColor: '#eef0ff', margin: '8px 0' }}>
                <Text style={kpiLabel}>Total Asset Value (Current)</Text>
                <Text style={{ ...kpiValue, color: assetValue.totalPositive ? '#4F46E5' : '#C62828' }}>₹{assetValue.total}</Text>
                <Text style={{ fontSize: '11px', color: '#6b6f8a', margin: '4px 0 0' }}>Banks + POS + Stock − Unpaid TDS</Text>
              </div>

              <Section style={card}>
                <Text style={sectionTitle}>Total Asset Value — Breakdown</Text>
                <Row label={`Bank Balances (${assetValue.bankCount})`} value={`₹${assetValue.totalBank}`} />
                <Row label={`POS / Gateway (${assetValue.pendingCount} pending)`} value={`₹${assetValue.totalGateway}`} />
                <Row label="Stock Valuation (Multi-Asset)" value={`₹${assetValue.stockVal}`} />
                <Row label={`Unpaid TDS (${assetValue.tdsCount})`} value={`- ₹${assetValue.totalUnpaidTds}`} />
                <Hr style={divider} />
                <Row label="Net Total Asset Value" value={`₹${assetValue.total}`} />

                {assetValue.assetStocks.length > 0 && (
                  <>
                    <Text style={subTitle}>Stock by Asset</Text>
                    <table style={tbl}>
                      <thead><tr><th style={th}>Asset</th><th style={thR}>Units</th><th style={thR}>Avg Cost (₹)</th><th style={thR}>Value (₹)</th></tr></thead>
                      <tbody>
                        {assetValue.assetStocks.map((a, i) => (
                          <tr key={i}>
                            <td style={td}>{a.asset}</td>
                            <td style={tdR}>{a.units}</td>
                            <td style={tdR}>{a.avgCost}</td>
                            <td style={tdR}>{a.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {assetValue.gatewayGroups.length > 0 && (
                  <>
                    <Text style={subTitle}>POS / Gateway Detail</Text>
                    <table style={tbl}>
                      <thead><tr><th style={th}>Gateway</th><th style={thR}>Txns</th><th style={thR}>Amount (₹)</th></tr></thead>
                      <tbody>
                        {assetValue.gatewayGroups.map((g, i) => (
                          <tr key={i}>
                            <td style={td}>{g.name}</td>
                            <td style={tdR}>{g.count}</td>
                            <td style={tdR}>{g.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Section>
            </Section>
          )}


          {/* P&L summary */}
          {pnl && (
            <Section style={card}>
              <Text style={sectionTitle}>P&amp;L Summary</Text>
              <Row label="Avg Sales Rate" value={`₹${pnl.avgSalesRate}`} />
              <Row label="Effective Purchase Rate" value={`₹${pnl.effectivePurchaseRate}`} />
              <Row label="Net Per-USDT Margin (NPM)" value={`₹${pnl.npm}`} />
              <Row label="Total Fees (USDT)" value={pnl.totalFees} />
            </Section>
          )}

          {charts?.pnl && <Img src={charts.pnl} alt="P&L Breakdown" style={chartImg} />}

          {/* Sales */}
          {sales && (
            <Section style={card}>
              <Text style={sectionTitle}>Sales Breakdown</Text>
              <Row label="Total Value" value={`₹${sales.totalValue}`} />
              <Row label="Total Qty (USDT-eq)" value={sales.totalQty} />
              <Row label="Completed Orders" value={`${sales.orderCount} / ${sales.totalOrders}`} />
              <Row label="Average Ticket" value={`₹${sales.avgTicket}`} />
              <AssetTable rows={sales.byAsset} />
            </Section>
          )}

          {/* Purchases */}
          {purchases && (
            <Section style={card}>
              <Text style={sectionTitle}>Purchases Breakdown</Text>
              <Row label="Total Value" value={`₹${purchases.totalValue}`} />
              <Row label="Total Qty (USDT-eq)" value={purchases.totalQty} />
              <Row label="Completed Orders" value={`${purchases.orderCount} / ${purchases.totalOrders}`} />
              <Row label="Average Ticket" value={`₹${purchases.avgTicket}`} />
              <AssetTable rows={purchases.byAsset} />
            </Section>
          )}

          {/* Shift-wise breakdown */}
          {shifts && shifts.length > 0 && (
            <Section style={card}>
              <Text style={sectionTitle}>Shift-wise Breakdown (Terminal Shifts)</Text>
              {shifts.map((s, i) => (
                <Section key={i} style={{ marginBottom: i < shifts.length - 1 ? '14px' : '0' }}>
                  <Text style={{ fontSize: '13px', fontWeight: 700, color: '#8C5A2B', margin: '0 0 2px' }}>{s.label}</Text>
                  <Text style={{ fontSize: '11px', color: '#9C8A78', margin: '0 0 6px' }}>{s.window}</Text>
                  <table style={tbl}>
                    <thead>
                      <tr>
                        <th style={th}>Metric</th>
                        <th style={thR}>Purchase</th>
                        <th style={thR}>Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={td}>Volume (USDT-eq)</td>
                        <td style={tdR}>{s.purchaseQty}</td>
                        <td style={tdR}>{s.salesQty}</td>
                      </tr>
                      <tr>
                        <td style={td}>Value (INR)</td>
                        <td style={tdR}>₹{s.purchaseValue}</td>
                        <td style={tdR}>₹{s.salesValue}</td>
                      </tr>
                      <tr>
                        <td style={td}>Avg Rate (INR)</td>
                        <td style={tdR}>₹{s.avgPurchaseRate}</td>
                        <td style={tdR}>₹{s.avgSalesRate}</td>
                      </tr>
                      <tr>
                        <td style={td}>Completed Orders</td>
                        <td style={tdR}>{s.purchaseCount}</td>
                        <td style={tdR}>{s.salesCount}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>
              ))}
            </Section>
          )}

          {/* Platform-wise average rates */}
          {platformRates && platformRates.length > 0 && (
            <Section style={card}>
              <Text style={sectionTitle}>Average Rates by Platform</Text>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={th}>Platform</th>
                    <th style={thR}>Avg Buy (INR)</th>
                    <th style={thR}>Avg Sell (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRates.map((p, i) => (
                    <tr key={i}>
                      <td style={td}>{p.platform}</td>
                      <td style={tdR}>{p.avgBuyRate === '—' ? '—' : `₹${p.avgBuyRate}`}<span style={{ color: '#9C8A78', fontSize: '10px' }}>{p.buyCount ? ` (${p.buyCount})` : ''}</span></td>
                      <td style={tdR}>{p.avgSellRate === '—' ? '—' : `₹${p.avgSellRate}`}<span style={{ color: '#9C8A78', fontSize: '10px' }}>{p.sellCount ? ` (${p.sellCount})` : ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Text style={{ fontSize: '10px', color: '#9C8A78', margin: '6px 0 0' }}>Order counts shown in parentheses.</Text>
            </Section>
          )}






          {charts?.salesVsPurchase && <Img src={charts.salesVsPurchase} alt="Sales vs Purchases" style={chartImg} />}
          {charts?.volumeByAsset && <Img src={charts.volumeByAsset} alt="Volume by Asset" style={chartImg} />}

          {/* Wallet & fees */}
          {wallet && (
            <Section style={card}>
              <Text style={sectionTitle}>Wallet Balances &amp; Fees</Text>
              {wallet.balances.length > 0 && (
                <table style={tbl}>
                  <thead><tr><th style={th}>Asset</th><th style={thR}>Balance</th></tr></thead>
                  <tbody>
                    {wallet.balances.map((b, i) => (
                      <tr key={i}><td style={td}>{b.asset}</td><td style={tdR}>{b.balance}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Hr style={divider} />
              {wallet.feesByType.map((f, i) => (
                <Row key={i} label={f.type} value={f.amount} />
              ))}
              <Row label="Total Fees" value={wallet.totalFees} />
            </Section>
          )}

          {/* Expenses */}
          {expenses && (
            <Section style={card}>
              <Text style={sectionTitle}>Expenses</Text>
              <Row label="Total Expenses" value={`₹${expenses.totalExpenses}`} />
              <Row label="Entries" value={`${expenses.count}`} />
              {expenses.byCategory.length > 0 && (
                <>
                  <Text style={subTitle}>By Category</Text>
                  <table style={tbl}>
                    <thead><tr><th style={th}>Category</th><th style={thR}>Amount (₹)</th></tr></thead>
                    <tbody>
                      {expenses.byCategory.map((c, i) => (
                        <tr key={i}><td style={td}>{c.category}</td><td style={tdR}>{c.amount}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {expenses.list.length > 0 && (
                <>
                  <Text style={subTitle}>Expense List</Text>
                  <table style={tbl}>
                    <thead><tr><th style={th}>Category</th><th style={th}>Description</th><th style={thR}>Amount (₹)</th></tr></thead>
                    <tbody>
                      {expenses.list.map((e, i) => (
                        <tr key={i}>
                          <td style={td}>{e.category}</td>
                          <td style={td}>{e.description}</td>
                          <td style={tdR}>{e.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {expenses.list.length === 0 && <Text style={text}>No expenses recorded for this day.</Text>}
            </Section>
          )}

          {charts?.expensesByCategory && <Img src={charts.expensesByCategory} alt="Expenses by Category" style={chartImg} />}


          {/* Statistics */}
          {stats && (
            <Section style={card}>
              <Text style={sectionTitle}>Statistics</Text>
              <Row label="Total Orders" value={`${stats.totalOrders}`} />
              <Row label="Completed Orders" value={`${stats.completedOrders}`} />
              <Row label="Busiest Hour" value={stats.busiestHour} />
              <Row label="Sales vs Prev Day" value={`${stats.salesChangePct}%`} />
              <Row label="Purchases vs Prev Day" value={`${stats.purchaseChangePct}%`} />
              {stats.topClients.length > 0 && (
                <>
                  <Text style={subTitle}>Top Clients by Sales</Text>
                  {stats.topClients.map((c, i) => (
                    <Row key={i} label={c.name} value={`₹${c.value}`} />
                  ))}
                </>
              )}
            </Section>
          )}

          {charts?.hourly && <Img src={charts.hourly} alt="Hourly Activity" style={chartImg} />}

          {/* Low-priority: Buyer-client KYC onboarding summary (shown last, by design) */}
          {kyc && (
            <Section style={{ ...card, backgroundColor: '#faf7f2', borderColor: '#e6dccb' }}>
              <Text style={sectionTitle}>Buyer Client KYC — Onboarding Summary</Text>
              <Text style={{ fontSize: '11px', color: '#9C8A78', margin: '0 0 8px' }}>
                Buyer-side only (clients who bought from us). "New" = client whose first-ever purchase from us was on this day. "Approved" / "Pending" mirror the ERP Client Onboarding Approvals screen (deduplicated by client name).
              </Text>
              <Row label="New Buyer Clients (first purchase today)" value={`${kyc.newClients}`} />
              <Row label="Buyer Clients Approved Today" value={`${kyc.approvedToday}`} />
              <Row label="Buyer Clients Pending Approval" value={`${kyc.pendingTotal}`} />

            </Section>
          )}

          {/* Rejected ERP entries — audit (bottom) */}
          {rejected && (
            <Section style={{ ...card, backgroundColor: '#fdf3f3', borderColor: '#e6bcbc' }}>
              <Text style={{ ...sectionTitle, color: '#C62828', borderBottomColor: '#C62828' }}>
                Rejected ERP Entries (Audit) — {rejected.count}
              </Text>
              <Text style={{ fontSize: '11px', color: '#9C7878', margin: '0 0 8px' }}>
                Every ERP transactional entry rejected on this day (terminal buys/sales, small buys/sales batches, deposits/withdrawals and conversions), with the user who rejected it. Audit-complete — no rejected entry is skipped.
              </Text>
              {rejected.count === 0 ? (
                <Text style={{ fontSize: '13px', color: '#555', margin: '4px 0' }}>No entries were rejected on this day.</Text>
              ) : (
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Type</th>
                      <th style={th}>Details</th>
                      <th style={thR}>Amount</th>
                      <th style={th}>Rejected By</th>
                      <th style={thR}>Time</th>
                      <th style={th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejected.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.type}</td>
                        <td style={td}>{r.label}{r.counterparty && r.counterparty !== '—' ? ` · ${r.counterparty}` : ''}</td>
                        <td style={tdR}>{r.amount}</td>
                        <td style={td}>{r.rejectedBy}</td>
                        <td style={tdR}>{r.rejectedAt}</td>
                        <td style={td}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}

          {/* ERP vs Terminal USDT balance difference — captured at 4 AM (bottom-most) */}
          {erpDiff && (
            <Section style={{ ...card, backgroundColor: '#f3f6fb', borderColor: '#bcd0e6' }}>
              <Text style={{ ...sectionTitle, color: '#1565C0', borderBottomColor: '#1565C0' }}>
                ERP vs Terminal Balance Insight (USDT)
              </Text>
              <Text style={{ fontSize: '11px', color: '#5b7796', margin: '0 0 8px' }}>
                Per Binance account: USDT balance recorded in the ERP (Asset Inventory · Wallet Distribution)
                versus the actual live balance in the terminal. Captured by the system at 4:00 AM IST.
              </Text>
              {erpDiff.count === 0 ? (
                <Text style={{ fontSize: '13px', color: '#555', margin: '4px 0' }}>No 4 AM balance snapshot was available for this report.</Text>
              ) : (
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Account</th>
                      <th style={thR}>ERP USDT</th>
                      <th style={thR}>Terminal USDT</th>
                      <th style={thR}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {erpDiff.rows.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.account}</td>
                        <td style={tdR}>{r.erp}</td>
                        <td style={tdR}>{r.status === 'error' ? 'Unavailable' : r.terminal}</td>
                        <td style={{ ...tdR, color: r.hasDrift ? '#C62828' : '#2E7D32', fontWeight: 600 }}>{r.difference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}

          <Hr style={divider} />

          <Text style={footer}>
            Automated daily report from {SITE_NAME} ERP. All figures are derived from the
            system's verified ledger (effective USDT valuation). Adjustment buckets are excluded.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={rowTbl}><tbody><tr>
    <td style={rowLabel}>{label}</td>
    <td style={rowValue}>{value}</td>
  </tr></tbody></table>
)

const AssetTable = ({ rows }: { rows: AssetRow[] }) => {
  if (!rows || rows.length === 0) return null
  return (
    <table style={tbl}>
      <thead><tr><th style={th}>Asset</th><th style={thR}>Qty</th><th style={thR}>Value (₹)</th><th style={thR}>Orders</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={td}>{r.asset}</td>
            <td style={tdR}>{r.qty}</td>
            <td style={tdR}>{r.value}</td>
            <td style={tdR}>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const template = {
  component: DailyBusinessReport,
  subject: (data: Record<string, any>) => {
    const d = data.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
    return `📊 Daily Business Report — ${d}`
  },
  displayName: 'Daily Business Report',
  previewData: {
    date: '2026-06-16',
    pnl: { grossProfit: '12,500.00', netProfit: '11,200.00', avgSalesRate: '92.5000', effectivePurchaseRate: '91.2000', npm: '1.3000', totalFees: '120.0000', netProfitPositive: true },
    sales: { totalQty: '5,000.0000', totalValue: '4,62,500.00', orderCount: 12, totalOrders: 14, avgTicket: '38,541.67', byAsset: [{ asset: 'USDT', qty: '5,000.0000', value: '4,62,500.00', count: 12 }] },
    purchases: { totalQty: '4,800.0000', totalValue: '4,37,760.00', orderCount: 9, totalOrders: 10, avgTicket: '48,640.00', byAsset: [{ asset: 'USDT', qty: '4,800.0000', value: '4,37,760.00', count: 9 }] },
    shifts: [
      { key: 'morning', label: 'Morning Shift', window: '09:00 – 17:00 IST', purchaseQty: '2,000.0000', purchaseValue: '1,82,400.00', purchaseCount: 4, avgPurchaseRate: '91.2000', salesQty: '2,100.0000', salesValue: '1,94,250.00', salesCount: 5, avgSalesRate: '92.5000' },
      { key: 'evening', label: 'Evening Shift', window: '17:00 – 01:00 IST', purchaseQty: '1,800.0000', purchaseValue: '1,64,160.00', purchaseCount: 3, avgPurchaseRate: '91.2000', salesQty: '1,900.0000', salesValue: '1,75,750.00', salesCount: 5, avgSalesRate: '92.5000' },
      { key: 'night', label: 'Night Shift', window: '01:00 – 09:00 IST', purchaseQty: '1,000.0000', purchaseValue: '91,200.00', purchaseCount: 2, avgPurchaseRate: '91.2000', salesQty: '1,000.0000', salesValue: '92,500.00', salesCount: 2, avgSalesRate: '92.5000' },
    ],
    platformRates: [
      { platform: 'Binance (Blynk)', avgBuyRate: '91.2000', buyCount: 7, avgSellRate: '92.5000', sellCount: 9 },
      { platform: 'Binance (ASEC)', avgBuyRate: '91.0500', buyCount: 2, avgSellRate: '92.4000', sellCount: 2 },
      { platform: 'KuCoin', avgBuyRate: '—', buyCount: 0, avgSellRate: '92.6000', sellCount: 1 },
    ],



    wallet: { balances: [{ asset: 'USDT', balance: '12,340.5000' }, { asset: 'TRX', balance: '500.0000' }], feesByType: [{ type: 'PLATFORM FEE', amount: '100.0000' }], totalFees: '120.0000' },
    expenses: { totalExpenses: '8,500.00', count: 3, byCategory: [{ category: 'Office > Rent', amount: '6,000.00' }, { category: 'Utilities', amount: '2,500.00' }], list: [{ category: 'Office > Rent', description: 'June office rent', amount: '6,000.00' }, { category: 'Utilities', description: 'Electricity bill', amount: '2,500.00' }] },
    stats: { busiestHour: '14:00 - 15:00 IST', totalOrders: 24, completedOrders: 21, topClients: [{ name: 'Rahul', value: '1,20,000.00' }], salesChangePct: '8.5', purchaseChangePct: '5.1' },
    assetValue: {
      total: '85,40,000.00', totalPositive: true,
      totalBank: '42,10,000.00', totalGateway: '3,50,000.00', stockVal: '41,20,000.00', totalUnpaidTds: '1,40,000.00',
      bankCount: 6, pendingCount: 12, tdsCount: 8,
      assetStocks: [
        { asset: 'USDT', units: '40,000.0000', avgCost: '91.5000', value: '36,60,000.00' },
        { asset: 'BTC', units: '0.0500', avgCost: '90,00,000.0000', value: '4,50,000.00' },
      ],
      gatewayGroups: [{ name: 'Razorpay', total: '3,50,000.00', count: 12 }],
    },
    charts: { salesVsPurchase: '', pnl: '', volumeByAsset: '', hourly: '', expensesByCategory: '' },
    rejected: { count: 2, rows: [
      { type: 'Terminal Sale', label: 'Order 22938471', amount: '1,200.00 USDT', counterparty: 'UPI · rahul_p', reason: 'Wrong payment proof', rejectedBy: 'Abhishek Singh', rejectedAt: '14:32 IST' },
      { type: 'Deposit', label: 'Deposit · TRX', amount: '500.00 TRX', counterparty: 'TRC20 · 9af13c0b2e…', reason: 'Duplicate movement', rejectedBy: 'Shubham Singh', rejectedAt: '11:05 IST' },
    ] },
    erpDiff: { count: 2, capturedAt: '2026-06-26T22:30:00Z', rows: [
      { account: 'Blynk Binance', erp: '9,409.0400', terminal: '9,410.0000', difference: '-0.9600', hasDrift: false, status: 'ok' },
      { account: 'ASEC Binance', erp: '2,977.2175', terminal: '2,950.0000', difference: '27.2175', hasDrift: true, status: 'ok' },
    ] },

  },
} satisfies TemplateEntry

// ---------- styles ----------
const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { background: 'linear-gradient(135deg,#8C5A2B,#B87333)', backgroundColor: '#8C5A2B', padding: '24px 30px', borderRadius: '8px 8px 0 0' }
const headerText = { color: '#ffffff', fontSize: '18px', fontWeight: 'bold' as const, margin: '0' }
const headerSub = { color: '#fbe9d7', fontSize: '13px', margin: '4px 0 0' }
const content = { padding: '24px 30px' }
const h1 = { fontSize: '18px', fontWeight: 'bold' as const, color: '#8C5A2B', margin: '0 0 8px' }
const text = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 16px' }
const kpiRow = { display: 'table', width: '100%', borderSpacing: '8px 0', tableLayout: 'fixed' as const }
const kpiCard = { display: 'table-cell', width: '50%', backgroundColor: '#fdf6ef', border: '2px solid #B87333', borderRadius: '8px', padding: '14px', textAlign: 'center' as const }
const kpiLabel = { fontSize: '12px', color: '#8a6a4a', margin: '0 0 6px', textTransform: 'uppercase' as const }
const kpiValue = { fontSize: '20px', fontWeight: 'bold' as const, color: '#8C5A2B', margin: '0' }
const card = { backgroundColor: '#fdfaf6', border: '1px solid #ecddca', borderRadius: '8px', padding: '16px', margin: '18px 0' }
const sectionTitle = { fontSize: '15px', fontWeight: 'bold' as const, color: '#8C5A2B', margin: '0 0 12px', borderBottom: '2px solid #B87333', paddingBottom: '6px' }
const subTitle = { fontSize: '13px', fontWeight: 'bold' as const, color: '#8C5A2B', margin: '14px 0 6px' }
const rowTbl = { width: '100%', borderCollapse: 'collapse' as const }
const rowLabel = { fontSize: '13px', color: '#666666', padding: '5px 0', textAlign: 'left' as const }
const rowValue = { fontSize: '13px', color: '#1a1a2e', fontWeight: 'bold' as const, padding: '5px 0', textAlign: 'right' as const }
const tbl = { width: '100%', borderCollapse: 'collapse' as const, margin: '12px 0', fontSize: '12px' }
const th = { textAlign: 'left' as const, padding: '6px 8px', backgroundColor: '#B87333', color: '#ffffff', fontSize: '12px' }
const thR = { ...th, textAlign: 'right' as const }
const td = { padding: '6px 8px', borderBottom: '1px solid #ecddca', color: '#333333' }
const tdR = { ...td, textAlign: 'right' as const }
const chartImg = { width: '100%', maxWidth: '560px', height: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid #ecddca' }
const divider = { borderTop: '1px solid #ecddca', margin: '16px 0' }
const footer = { fontSize: '11px', color: '#999999', margin: '0', lineHeight: '1.5' }

export default DailyBusinessReport
