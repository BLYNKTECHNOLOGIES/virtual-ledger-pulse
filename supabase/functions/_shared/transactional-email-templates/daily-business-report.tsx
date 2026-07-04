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
  Font,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'


const SITE_NAME = 'BLYNK Virtual Technologies'

/* ---------- design tokens (swap the whole palette here) ---------- */
const theme = {
  primary: '#4F46E5',
  primaryDeep: '#4338CA',
  ink: '#1E293B',
  muted: '#64748B',
  hairline: '#E2E8F0',
  canvas: '#F8FAFC',
  surface: '#FFFFFF',
  positive: '#16A34A',
  negative: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
  tintIndigo: '#EEF2FF',
  tintRed: '#FEF2F2',
  tintBlue: '#EFF6FF',
  tintAmber: '#FFFBEB',
}
const FONT_STACK = 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

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

/* ---------- small presentational helpers ---------- */
const DeltaPill = ({ pct }: { pct?: string }) => {
  if (pct === undefined || pct === null || pct === 'N/A' || pct === '') {
    return <span style={pillNeutral}>N/A</span>
  }
  const negative = String(pct).trim().startsWith('-')
  return (
    <span style={negative ? pillDown : pillUp}>
      {negative ? '▼' : '▲'} {pct}%
    </span>
  )
}

const SectionHead = ({ eyebrow, title, accent, badge }: { eyebrow: string; title: string; accent?: string; badge?: number }) => (
  <div style={{ marginBottom: '12px', borderBottom: `1px solid ${accent || theme.hairline}`, paddingBottom: '8px' }}>
    <Text style={{ ...eyebrowStyle, color: accent || theme.primary }}>{eyebrow}</Text>
    <Text style={{ ...sectionTitle, color: accent || theme.ink }}>
      {title}
      {badge !== undefined && (
        <span style={{ ...countBadge, backgroundColor: accent || theme.primary }}>{badge}</span>
      )}
    </Text>
  </div>
)

const ChartBlock = ({ src, alt, caption }: { src?: string; alt: string; caption: string }) => {
  if (!src) return null
  return (
    <div style={{ margin: '16px 0' }}>
      <Text style={chartCaption}>{caption}</Text>
      <Img src={src} alt={alt} style={chartImg} />
    </div>
  )
}

const DailyBusinessReport = ({ date, isMonthly, periodLabel, periodStart, periodEnd, pnl, sales, purchases, wallet, expenses, shifts, platformRates, stats, assetValue, charts, kyc, rejected, erpDiff }: DailyReportProps) => {
  const reportKind = isMonthly ? 'Monthly Business Report' : 'Daily Business Report'
  const periodTitle = isMonthly ? (periodLabel || formatDate(periodStart)) : formatDate(date)
  const introText = isMonthly
    ? `Full-month summary (${formatDate(periodStart)} – ${formatDate(periodEnd)}, IST) of P&\u00A0L, sales, purchases, wallet balances and key statistics.`
    : 'Full-day summary (12:00 AM – 12:00 AM IST) of P&\u00A0L, sales, purchases, wallet balances and key statistics.'

  const preheaderBits: string[] = []
  if (pnl) preheaderBits.push(`Net Profit ₹${pnl.netProfit}`)
  if (sales) preheaderBits.push(`Sales ₹${sales.totalValue}`)
  if (assetValue) preheaderBits.push(`Assets ₹${assetValue.total}`)
  const preheader = preheaderBits.length ? `${reportKind} — ${preheaderBits.join(' · ')}` : `${reportKind} — ${periodTitle}`

  return (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <Font
        fontFamily="Inter"
        fallbackFontFamily={['Helvetica', 'Arial', 'sans-serif']}
        webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', format: 'woff2' }}
        fontWeight={400}
        fontStyle="normal"
      />
      <style>{`
        body { margin:0; padding:0; }
        img { border:0; line-height:100%; outline:none; text-decoration:none; }
        table { border-collapse:collapse; }
        .zebra tr:nth-child(even) td { background-color:${theme.canvas}; }
        @media only screen and (max-width:600px) {
          .stack { display:block !important; width:100% !important; box-sizing:border-box !important; }
          .stack-pad { padding:6px 0 !important; }
          .hero-num { font-size:24px !important; }
          .content-pad { padding:18px 16px !important; }
        }
      `}</style>
    </Head>
    <Preview>{preheader}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Brand band */}
        <Section style={headerBar}>
          <Text style={headerText}>{SITE_NAME}</Text>
          <Text style={headerSub}>{reportKind}</Text>
          <Text style={headerPeriod}>{periodTitle}</Text>
        </Section>

        <Section style={content} className="content-pad">
          <Heading style={h1}>Report for {periodTitle}</Heading>
          <Text style={text}>{introText}</Text>

          {/* Hero scorecard — glanceable summary built only from existing props */}
          {(pnl || assetValue || sales || purchases) && (
            <table role="presentation" width="100%" style={heroTable}>
              <tbody>
                <tr>
                  {pnl && (
                    <td className="stack stack-pad" style={{ ...heroCell, backgroundColor: theme.tintIndigo, width: '50%' }}>
                      <Text style={heroLabel}>Net Profit</Text>
                      <Text className="hero-num" style={{ ...heroNum, color: pnl.netProfitPositive ? theme.positive : theme.negative }}>₹{pnl.netProfit}</Text>
                    </td>
                  )}
                  {assetValue && (
                    <td className="stack stack-pad" style={{ ...heroCell, backgroundColor: theme.tintBlue, width: '50%' }}>
                      <Text style={heroLabel}>Total Asset Value</Text>
                      <Text className="hero-num" style={{ ...heroNum, color: assetValue.totalPositive ? theme.primary : theme.negative }}>₹{assetValue.total}</Text>
                    </td>
                  )}
                </tr>
                <tr>
                  {sales && (
                    <td className="stack stack-pad" style={{ ...heroCell, backgroundColor: theme.surface, width: '50%' }}>
                      <Text style={heroLabel}>Sales Value</Text>
                      <Text className="hero-num" style={{ ...heroNum, color: theme.ink }}>₹{sales.totalValue}</Text>
                      {stats && <div style={{ marginTop: '6px' }}><DeltaPill pct={stats.salesChangePct} /></div>}
                    </td>
                  )}
                  {purchases && (
                    <td className="stack stack-pad" style={{ ...heroCell, backgroundColor: theme.surface, width: '50%' }}>
                      <Text style={heroLabel}>Purchases Value</Text>
                      <Text className="hero-num" style={{ ...heroNum, color: theme.ink }}>₹{purchases.totalValue}</Text>
                      {stats && <div style={{ marginTop: '6px' }}><DeltaPill pct={stats.purchaseChangePct} /></div>}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          )}

          {/* Total Asset Value (from Financials tab) */}
          {assetValue && (
            <Section style={card}>
              <SectionHead eyebrow="Financials" title="Total Asset Value" />
              <div style={{ ...highlightCard, backgroundColor: theme.tintIndigo }}>
                <Text style={eyebrowStyle}>Total Asset Value (Current)</Text>
                <Text style={{ ...heroNum, color: assetValue.totalPositive ? theme.primary : theme.negative, margin: '2px 0 0' }}>₹{assetValue.total}</Text>
                <Text style={{ fontSize: '11px', color: theme.muted, margin: '4px 0 0' }}>Banks + POS + Stock − Unpaid TDS</Text>
              </div>

              <Row label={`Bank Balances (${assetValue.bankCount})`} value={`₹${assetValue.totalBank}`} />
              <Row label={`POS / Gateway (${assetValue.pendingCount} pending)`} value={`₹${assetValue.totalGateway}`} />
              <Row label="Stock Valuation (Multi-Asset)" value={`₹${assetValue.stockVal}`} />
              <Row label={`Unpaid TDS (${assetValue.tdsCount})`} value={`- ₹${assetValue.totalUnpaidTds}`} />
              <Hr style={divider} />
              <Row label="Net Total Asset Value" value={`₹${assetValue.total}`} strong />

              {assetValue.assetStocks.length > 0 && (
                <>
                  <Text style={subTitle}>Stock by Asset</Text>
                  <table className="zebra" style={tbl}>
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
                  <table className="zebra" style={tbl}>
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
          )}

          {/* P&L summary */}
          {pnl && (
            <Section style={card}>
              <SectionHead eyebrow="Profitability" title="P&L Summary" />
              <Row label="Gross Profit" value={`₹${pnl.grossProfit}`} />
              <Row label="Net Profit" value={`₹${pnl.netProfit}`} strong valueColor={pnl.netProfitPositive ? theme.positive : theme.negative} />
              <Row label="Avg Sales Rate" value={`₹${pnl.avgSalesRate}`} />
              <Row label="Effective Purchase Rate" value={`₹${pnl.effectivePurchaseRate}`} />
              <Row label="Net Per-USDT Margin (NPM)" value={`₹${pnl.npm}`} />
              <Row label="Total Fees (USDT)" value={pnl.totalFees} />
            </Section>
          )}

          <ChartBlock src={charts?.pnl} alt="P&L Breakdown" caption="P&L Breakdown" />

          {/* Sales */}
          {sales && (
            <Section style={card}>
              <SectionHead eyebrow="Revenue" title="Sales Breakdown" />
              <Row label="Total Value" value={`₹${sales.totalValue}`} strong />
              <Row label="Total Qty (USDT-eq)" value={sales.totalQty} />
              <Row label="Completed Orders" value={`${sales.orderCount} / ${sales.totalOrders}`} />
              <Row label="Average Ticket" value={`₹${sales.avgTicket}`} />
              <AssetTable rows={sales.byAsset} />
            </Section>
          )}

          {/* Purchases */}
          {purchases && (
            <Section style={card}>
              <SectionHead eyebrow="Sourcing" title="Purchases Breakdown" />
              <Row label="Total Value" value={`₹${purchases.totalValue}`} strong />
              <Row label="Total Qty (USDT-eq)" value={purchases.totalQty} />
              <Row label="Completed Orders" value={`${purchases.orderCount} / ${purchases.totalOrders}`} />
              <Row label="Average Ticket" value={`₹${purchases.avgTicket}`} />
              <AssetTable rows={purchases.byAsset} />
            </Section>
          )}

          {/* Shift-wise breakdown */}
          {shifts && shifts.length > 0 && (
            <Section style={card}>
              <SectionHead eyebrow="Operations" title="Shift-wise Breakdown (Terminal Shifts)" />
              {shifts.map((s, i) => (
                <Section key={i} style={{ marginBottom: i < shifts.length - 1 ? '14px' : '0' }}>
                  <Text style={{ fontSize: '13px', fontWeight: 700, color: theme.ink, margin: '0 0 2px' }}>{s.label}</Text>
                  <Text style={{ fontSize: '11px', color: theme.muted, margin: '0 0 6px' }}>{s.window}</Text>
                  <table className="zebra" style={tbl}>
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
              <SectionHead eyebrow="Market" title="Average Rates by Platform" />
              <table className="zebra" style={tbl}>
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
                      <td style={tdR}>{p.avgBuyRate === '—' ? '—' : `₹${p.avgBuyRate}`}<span style={{ color: theme.muted, fontSize: '10px' }}>{p.buyCount ? ` (${p.buyCount})` : ''}</span></td>
                      <td style={tdR}>{p.avgSellRate === '—' ? '—' : `₹${p.avgSellRate}`}<span style={{ color: theme.muted, fontSize: '10px' }}>{p.sellCount ? ` (${p.sellCount})` : ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Text style={{ fontSize: '10px', color: theme.muted, margin: '6px 0 0' }}>Order counts shown in parentheses.</Text>
            </Section>
          )}

          <ChartBlock src={charts?.salesVsPurchase} alt="Sales vs Purchases" caption="Sales vs Purchases" />
          <ChartBlock src={charts?.volumeByAsset} alt="Volume by Asset" caption="Volume by Asset" />

          {/* Wallet & fees */}
          {wallet && (
            <Section style={card}>
              <SectionHead eyebrow="Treasury" title="Wallet Balances & Fees" />
              {wallet.balances.length > 0 && (
                <table className="zebra" style={tbl}>
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
              <Row label="Total Fees" value={wallet.totalFees} strong />
            </Section>
          )}

          {/* Expenses */}
          {expenses && (
            <Section style={card}>
              <SectionHead eyebrow="Outflow" title="Expenses" />
              <Row label="Total Expenses" value={`₹${expenses.totalExpenses}`} strong />
              <Row label="Entries" value={`${expenses.count}`} />
              {expenses.byCategory.length > 0 && (
                <>
                  <Text style={subTitle}>By Category</Text>
                  <table className="zebra" style={tbl}>
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
                  <table className="zebra" style={tbl}>
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

          <ChartBlock src={charts?.expensesByCategory} alt="Expenses by Category" caption="Expenses by Category" />

          {/* Statistics */}
          {stats && (
            <Section style={card}>
              <SectionHead eyebrow="Insights" title="Statistics" />
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

          <ChartBlock src={charts?.hourly} alt="Hourly Activity" caption="Hourly Activity" />

          {/* Low-priority: Buyer-client KYC onboarding summary (shown last, by design) */}
          {kyc && (
            <Section style={{ ...card, backgroundColor: theme.canvas }}>
              <SectionHead eyebrow="Compliance" title="Buyer Client KYC — Onboarding Summary" accent={theme.muted} />
              <Text style={{ fontSize: '11px', color: theme.muted, margin: '0 0 8px' }}>
                Buyer-side only (clients who bought from us). "New" = client whose first-ever purchase from us was on this day. "Approved" / "Pending" mirror the ERP Client Onboarding Approvals screen (deduplicated by client name).
              </Text>
              <Row label="New Buyer Clients (first purchase today)" value={`${kyc.newClients}`} />
              <Row label="Buyer Clients Approved Today" value={`${kyc.approvedToday}`} />
              <Row label="Buyer Clients Pending Approval" value={`${kyc.pendingTotal}`} />
            </Section>
          )}

          {/* Rejected ERP entries — audit (bottom) */}
          {rejected && (
            <Section style={{ ...card, backgroundColor: theme.tintRed, borderColor: '#FECACA' }}>
              <SectionHead eyebrow="Audit" title="Rejected ERP Entries (Audit)" accent={theme.negative} badge={rejected.count} />
              <Text style={{ fontSize: '11px', color: theme.negative, margin: '0 0 8px' }}>
                Every ERP transactional entry rejected on this day (terminal buys/sales, small buys/sales batches, deposits/withdrawals and conversions), with the user who rejected it. Audit-complete — no rejected entry is skipped.
              </Text>
              {rejected.count === 0 ? (
                <Text style={{ fontSize: '13px', color: theme.muted, margin: '4px 0' }}>No entries were rejected on this day.</Text>
              ) : (
                <table className="zebra" style={tbl}>
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
            <Section style={{ ...card, backgroundColor: theme.tintBlue, borderColor: '#BFDBFE' }}>
              <SectionHead eyebrow="Reconciliation" title="ERP vs Terminal Balance Insight (USDT)" accent={theme.info} />
              <Text style={{ fontSize: '11px', color: theme.info, margin: '0 0 8px' }}>
                Per Binance account: USDT balance recorded in the ERP (Asset Inventory · Wallet Distribution)
                versus the actual live balance in the terminal. Captured by the system at 4:00 AM IST.
              </Text>
              {erpDiff.count === 0 ? (
                <Text style={{ fontSize: '13px', color: theme.muted, margin: '4px 0' }}>No 4 AM balance snapshot was available for this report.</Text>
              ) : (
                <table className="zebra" style={tbl}>
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
                        <td style={{ ...tdR, color: r.hasDrift ? theme.negative : theme.positive, fontWeight: 600 }}>
                          {r.difference}
                          {r.hasDrift && <span style={driftPill}>DRIFT</span>}
                        </td>
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
}

const Row = ({ label, value, strong, valueColor }: { label: string; value: string; strong?: boolean; valueColor?: string }) => (
  <table role="presentation" style={rowTbl}><tbody><tr>
    <td style={rowLabel}>{label}</td>
    <td style={{ ...rowValue, ...(strong ? { fontSize: '14px', color: theme.ink } : {}), ...(valueColor ? { color: valueColor } : {}) }}>{value}</td>
  </tr></tbody></table>
)

const AssetTable = ({ rows }: { rows: AssetRow[] }) => {
  if (!rows || rows.length === 0) return null
  return (
    <table className="zebra" style={tbl}>
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
    if (data.isMonthly) {
      const label = data.periodLabel || (data.periodStart ? new Date(data.periodStart + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '')
      return `📊 Monthly Business Report — ${label}`
    }
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

/* ---------- styles ---------- */
const main = { backgroundColor: theme.canvas, fontFamily: FONT_STACK, margin: '0', padding: '0' }
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: theme.surface }
const headerBar = { background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDeep})`, backgroundColor: theme.primary, padding: '28px 30px' }
const headerText = { color: '#ffffff', fontSize: '19px', fontWeight: 700 as const, margin: '0', letterSpacing: '0.2px' }
const headerSub = { color: '#E0E7FF', fontSize: '12px', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '1px', fontWeight: 600 as const }
const headerPeriod = { color: '#C7D2FE', fontSize: '12px', margin: '2px 0 0' }
const content = { padding: '24px 30px' }
const h1 = { fontSize: '18px', fontWeight: 700 as const, color: theme.ink, margin: '0 0 6px' }
const text = { fontSize: '13px', color: theme.muted, lineHeight: '1.5', margin: '0 0 16px' }

const eyebrowStyle = { fontSize: '11px', color: theme.primary, margin: '0', textTransform: 'uppercase' as const, letterSpacing: '1px', fontWeight: 700 as const }

const heroTable = { width: '100%', margin: '4px 0 18px', borderSpacing: '0' }
const heroCell = { padding: '16px', border: `1px solid ${theme.hairline}`, borderRadius: '10px', textAlign: 'left' as const, verticalAlign: 'top' as const }
const heroLabel = { fontSize: '11px', color: theme.muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.8px', fontWeight: 700 as const }
const heroNum = { fontSize: '28px', fontWeight: 700 as const, color: theme.ink, margin: '0', fontVariantNumeric: 'tabular-nums' as const, lineHeight: '1.15' }

const highlightCard = { borderRadius: '10px', padding: '14px 16px', margin: '4px 0 12px', border: `1px solid ${theme.hairline}` }

const pillBase = { display: 'inline-block', fontSize: '11px', fontWeight: 700 as const, padding: '3px 8px', borderRadius: '999px', fontVariantNumeric: 'tabular-nums' as const }
const pillUp = { ...pillBase, color: theme.positive, backgroundColor: '#DCFCE7' }
const pillDown = { ...pillBase, color: theme.negative, backgroundColor: '#FEE2E2' }
const pillNeutral = { ...pillBase, color: theme.muted, backgroundColor: theme.canvas }

const countBadge = { display: 'inline-block', color: '#ffffff', fontSize: '11px', fontWeight: 700 as const, padding: '1px 8px', borderRadius: '999px', marginLeft: '8px', verticalAlign: 'middle' as const }
const driftPill = { display: 'inline-block', color: '#ffffff', backgroundColor: theme.negative, fontSize: '9px', fontWeight: 700 as const, padding: '1px 6px', borderRadius: '999px', marginLeft: '6px', letterSpacing: '0.5px' }

const card = { backgroundColor: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: '12px', padding: '18px', margin: '16px 0' }
const sectionTitle = { fontSize: '15px', fontWeight: 700 as const, color: theme.ink, margin: '2px 0 0' }
const subTitle = { fontSize: '13px', fontWeight: 700 as const, color: theme.ink, margin: '14px 0 6px' }

const rowTbl = { width: '100%', borderCollapse: 'collapse' as const }
const rowLabel = { fontSize: '13px', color: theme.muted, padding: '7px 0', textAlign: 'left' as const, borderBottom: `1px solid ${theme.hairline}` }
const rowValue = { fontSize: '13px', color: theme.ink, fontWeight: 700 as const, padding: '7px 0', textAlign: 'right' as const, borderBottom: `1px solid ${theme.hairline}`, fontVariantNumeric: 'tabular-nums' as const }

const tbl = { width: '100%', borderCollapse: 'collapse' as const, margin: '12px 0', fontSize: '12px' }
const th = { textAlign: 'left' as const, padding: '8px', backgroundColor: theme.tintIndigo, color: theme.muted, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.6px', fontWeight: 700 as const, borderBottom: `1px solid ${theme.hairline}` }
const thR = { ...th, textAlign: 'right' as const }
const td = { padding: '8px', borderBottom: `1px solid ${theme.hairline}`, color: theme.ink }
const tdR = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

const chartCaption = { fontSize: '11px', color: theme.muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.8px', fontWeight: 700 as const }
const chartImg = { width: '100%', maxWidth: '560px', height: 'auto', margin: '0', borderRadius: '10px', border: `1px solid ${theme.hairline}` }
const divider = { borderTop: `1px solid ${theme.hairline}`, margin: '16px 0' }
const footer = { fontSize: '11px', color: theme.muted, margin: '0', lineHeight: '1.5' }

export default DailyBusinessReport
