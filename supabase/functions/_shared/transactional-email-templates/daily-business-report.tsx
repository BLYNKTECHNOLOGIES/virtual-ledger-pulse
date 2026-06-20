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
  pnl?: {
    grossProfit: string; netProfit: string; avgSalesRate: string;
    effectivePurchaseRate: string; npm: string; totalFees: string; netProfitPositive: boolean
  }
  sales?: { totalQty: string; totalValue: string; orderCount: number; totalOrders: number; avgTicket: string; byAsset: AssetRow[] }
  purchases?: { totalQty: string; totalValue: string; orderCount: number; totalOrders: number; avgTicket: string; byAsset: AssetRow[] }
  wallet?: { balances: { asset: string; balance: string }[]; feesByType: { type: string; amount: string }[]; totalFees: string }
  expenses?: { totalExpenses: string; count: number; byCategory: { category: string; amount: string }[]; list: { category: string; description: string; amount: string }[] }
  stats?: { busiestHour: string; totalOrders: number; completedOrders: number; topClients: { name: string; value: string }[]; salesChangePct: string; purchaseChangePct: string }
  assetValue?: {
    total: string; totalPositive: boolean;
    totalBank: string; totalGateway: string; stockVal: string; totalUnpaidTds: string;
    bankCount: number; pendingCount: number; tdsCount: number;
    assetStocks: { asset: string; units: string; avgCost: string; value: string }[];
    gatewayGroups: { name: string; total: string; count: number }[];
  }
  charts?: { salesVsPurchase: string; pnl: string; volumeByAsset: string; hourly: string; expensesByCategory?: string }

}

const formatDate = (d?: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''

const DailyBusinessReport = ({ date, pnl, sales, purchases, wallet, expenses, stats, assetValue, charts }: DailyReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Daily Business Report — ${formatDate(date)}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Text style={headerText}>{SITE_NAME}</Text>
          <Text style={headerSub}>Daily Business Report</Text>
        </Section>

        <Section style={content}>
          <Heading style={h1}>Report for {formatDate(date)}</Heading>
          <Text style={text}>Full-day summary (12:00 AM – 12:00 AM IST) of P&amp;L, sales, purchases, wallet balances and key statistics.</Text>

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
    wallet: { balances: [{ asset: 'USDT', balance: '12,340.5000' }, { asset: 'TRX', balance: '500.0000' }], feesByType: [{ type: 'PLATFORM FEE', amount: '100.0000' }], totalFees: '120.0000' },
    expenses: { totalExpenses: '8,500.00', count: 3, byCategory: [{ category: 'Office > Rent', amount: '6,000.00' }, { category: 'Utilities', amount: '2,500.00' }], list: [{ category: 'Office > Rent', description: 'June office rent', amount: '6,000.00' }, { category: 'Utilities', description: 'Electricity bill', amount: '2,500.00' }] },
    stats: { busiestHour: '14:00 - 15:00 IST', totalOrders: 24, completedOrders: 21, topClients: [{ name: 'Rahul', value: '1,20,000.00' }], salesChangePct: '8.5', purchaseChangePct: '5.1' },
    charts: { salesVsPurchase: '', pnl: '', volumeByAsset: '', hourly: '', expensesByCategory: '' },
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
