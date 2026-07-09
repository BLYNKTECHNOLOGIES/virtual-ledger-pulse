/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BLYNK Virtual Technologies'

interface KycRmProps {
  date?: string
  kpis?: {
    newClients: number
    approvalsDone: number
    distinctApproved: number
    rejections: number
    kycDocs: number
    pendingBacklog: number
  }
  firstTime?: {
    count: number
    totalValue: string
    rows: { name: string; phone: string; value: string; operator: string }[]
  }
  trading?: {
    salesAmount: string; salesCount: number; salesClients: number
    purchaseAmount: string; purchaseCount: number; suppliers: number
    turnover: string; turnoverOrders: number
  }
  topClients?: { name: string; sales: string; purchase: string; total: string }[]
  productivity?: { name: string; approvals: number; rejections: number }[]
  compliance?: {
    pendingLimitRequests: number
    rekycToday: number
    highRiskOnboarded: number
    hasAny: boolean
  }
}

const formatDate = (d?: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''

const KycRmReport = ({ date, kpis, firstTime, trading, topClients, productivity, compliance }: KycRmProps) => {
  const title = formatDate(date)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`KYC & Client Management — Daily Report · ${title}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Text style={headerText}>{SITE_NAME}</Text>
            <Text style={headerSub}>KYC & Client Management — Daily Report</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Report for {title}</Heading>
            <Text style={text}>
              Daily summary (12:00 AM – 12:00 AM IST) of client onboarding, KYC approvals,
              first-time trading activity and RM/KYC team productivity.
            </Text>

            {/* Section 1 — KPI cards */}
            {kpis && (
              <Section>
                <div style={kpiRow}>
                  <div style={{ ...kpiCard, borderColor: '#0F6FC6' }}>
                    <Text style={kpiLabel}>New Clients Onboarded</Text>
                    <Text style={{ ...kpiValue, color: '#0F6FC6' }}>{kpis.newClients}</Text>
                  </div>
                  <div style={{ ...kpiCard, borderColor: '#2E7D32' }}>
                    <Text style={kpiLabel}>KYC Approvals Today</Text>
                    <Text style={{ ...kpiValue, color: '#2E7D32' }}>{kpis.approvalsDone}</Text>
                  </div>
                </div>
                <Section style={card}>
                  <Text style={sectionTitle}>Onboarding & KYC — Today</Text>
                  <Row label="New Clients Onboarded" value={`${kpis.newClients}`} />
                  <Row label="KYC / QC Approvals Done" value={`${kpis.approvalsDone}`} />
                  <Row label="Distinct Clients Approved" value={`${kpis.distinctApproved}`} />
                  <Row label="KYC Documents Uploaded" value={`${kpis.kycDocs}`} />
                  <Row label="Rejections" value={`${kpis.rejections}`} />
                  <Row label="Pending Approval Backlog" value={`${kpis.pendingBacklog}`} />
                </Section>
              </Section>
            )}

            {/* Section 2 — New clients traded first time */}
            {firstTime && (
              <Section style={card}>
                <Text style={sectionTitle}>New Clients — First Trade Today</Text>
                <Text style={{ fontSize: '11px', color: '#8a6a4a', margin: '0 0 8px' }}>
                  Clients whose very first order ever is dated today. {firstTime.count} client(s),
                  total first-trade value ₹{firstTime.totalValue}.
                </Text>
                {firstTime.rows.length === 0 ? (
                  <Text style={{ fontSize: '13px', color: '#555', margin: '4px 0' }}>No first-time traders today.</Text>
                ) : (
                  <table style={tbl}>
                    <thead><tr>
                      <th style={th}>Client</th><th style={th}>Phone</th>
                      <th style={thR}>First Order (₹)</th><th style={th}>Operator</th>
                    </tr></thead>
                    <tbody>
                      {firstTime.rows.map((r, i) => (
                        <tr key={i}>
                          <td style={td}>{r.name}</td>
                          <td style={td}>{r.phone}</td>
                          <td style={tdR}>{r.value}</td>
                          <td style={td}>{r.operator}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            )}

            {/* Section 3 — Trading activity segregated */}
            {trading && (
              <Section style={card}>
                <Text style={sectionTitle}>Client Trading Activity — Today</Text>
                <table style={tbl}>
                  <thead><tr>
                    <th style={th}>Flow</th><th style={thR}>Amount (₹)</th>
                    <th style={thR}>Orders</th><th style={thR}>Distinct Parties</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td style={td}>Sales (clients buying)</td>
                      <td style={tdR}>{trading.salesAmount}</td>
                      <td style={tdR}>{trading.salesCount}</td>
                      <td style={tdR}>{trading.salesClients}</td>
                    </tr>
                    <tr>
                      <td style={td}>Purchases (clients selling)</td>
                      <td style={tdR}>{trading.purchaseAmount}</td>
                      <td style={tdR}>{trading.purchaseCount}</td>
                      <td style={tdR}>{trading.suppliers}</td>
                    </tr>
                    <tr>
                      <td style={{ ...td, fontWeight: 700 }}>Total Turnover</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{trading.turnover}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{trading.turnoverOrders}</td>
                      <td style={tdR}>—</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            )}

            {/* Section 4 — Top clients by turnover */}
            {topClients && topClients.length > 0 && (
              <Section style={card}>
                <Text style={sectionTitle}>Top Clients by Turnover — Today</Text>
                <table style={tbl}>
                  <thead><tr>
                    <th style={th}>Client</th><th style={thR}>Sales (₹)</th>
                    <th style={thR}>Purchases (₹)</th><th style={thR}>Total (₹)</th>
                  </tr></thead>
                  <tbody>
                    {topClients.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.name}</td>
                        <td style={tdR}>{r.sales}</td>
                        <td style={tdR}>{r.purchase}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Section 5 — Team productivity */}
            {productivity && productivity.length > 0 && (
              <Section style={card}>
                <Text style={sectionTitle}>RM / KYC Team Productivity — Today</Text>
                <table style={tbl}>
                  <thead><tr>
                    <th style={th}>Reviewer</th><th style={thR}>Approvals</th><th style={thR}>Rejections</th>
                  </tr></thead>
                  <tbody>
                    {productivity.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.name}</td>
                        <td style={tdR}>{r.approvals}</td>
                        <td style={tdR}>{r.rejections}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Section 6 — Compliance watch (auto-hides when nothing to report) */}
            {compliance && compliance.hasAny && (
              <Section style={{ ...card, backgroundColor: '#f3f6fb', borderColor: '#bcd0e6' }}>
                <Text style={{ ...sectionTitle, color: '#1565C0', borderBottomColor: '#1565C0' }}>
                  Compliance Watch
                </Text>
                {compliance.pendingLimitRequests > 0 && (
                  <Row label="Pending Limit-Increase Requests" value={`${compliance.pendingLimitRequests}`} />
                )}
                {compliance.rekycToday > 0 && (
                  <Row label="Re-KYC Requests Raised Today" value={`${compliance.rekycToday}`} />
                )}
                {compliance.highRiskOnboarded > 0 && (
                  <Row label="High-Risk Clients Onboarded Today" value={`${compliance.highRiskOnboarded}`} />
                )}
              </Section>
            )}

            <Hr style={divider} />
            <Text style={footer}>
              Automated daily report from {SITE_NAME} ERP for the KYC & Client Management (RM)
              department. Figures are derived from the system's verified client, onboarding and
              order ledgers. Client email addresses are never collected or displayed.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={rowTbl}><tbody><tr>
    <td style={rowLabel}>{label}</td>
    <td style={rowValue}>{value}</td>
  </tr></tbody></table>
)

export const template = {
  component: KycRmReport,
  subject: (data: Record<string, any>) => {
    const d = data.date ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
    return `KYC & Client Management Report - ${d}`
  },
  displayName: 'KYC & Client Management Report',
  previewData: {
    date: '2026-07-09',
    kpis: { newClients: 30, approvalsDone: 49, distinctApproved: 20, rejections: 3, kycDocs: 104, pendingBacklog: 199 },
    firstTime: {
      count: 19, totalValue: '8,63,062.91',
      rows: [
        { name: 'Rahul Sharma', phone: '98••••210', value: '1,20,000.00', operator: 'Khushbu Parmar' },
        { name: 'Amit Verma', phone: '91••••554', value: '85,000.00', operator: 'Khushbu Parmar' },
      ],
    },
    trading: {
      salesAmount: '30,11,438.93', salesCount: 51, salesClients: 45,
      purchaseAmount: '23,19,506.25', purchaseCount: 32, suppliers: 30,
      turnover: '53,30,945.18', turnoverOrders: 83,
    },
    topClients: [
      { name: 'Rahul Sharma', sales: '1,20,000.00', purchase: '—', total: '1,20,000.00' },
      { name: 'Amit Verma', sales: '85,000.00', purchase: '40,000.00', total: '1,25,000.00' },
    ],
    productivity: [{ name: 'Khushbu Parmar', approvals: 49, rejections: 3 }],
    compliance: { pendingLimitRequests: 2, rekycToday: 0, highRiskOnboarded: 1, hasAny: true },
  },
} satisfies TemplateEntry

// ---------- styles ----------
const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { background: 'linear-gradient(135deg,#0B4C8C,#0F6FC6)', backgroundColor: '#0B4C8C', padding: '24px 30px', borderRadius: '8px 8px 0 0' }
const headerText = { color: '#ffffff', fontSize: '18px', fontWeight: 'bold' as const, margin: '0' }
const headerSub = { color: '#d7ecfb', fontSize: '13px', margin: '4px 0 0' }
const content = { padding: '24px 30px' }
const h1 = { fontSize: '18px', fontWeight: 'bold' as const, color: '#0B4C8C', margin: '0 0 8px' }
const text = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 16px' }
const kpiRow = { display: 'table', width: '100%', borderSpacing: '8px 0', tableLayout: 'fixed' as const }
const kpiCard = { display: 'table-cell', width: '50%', backgroundColor: '#f2f8fd', border: '2px solid #0F6FC6', borderRadius: '8px', padding: '14px', textAlign: 'center' as const }
const kpiLabel = { fontSize: '12px', color: '#4a6a8a', margin: '0 0 6px', textTransform: 'uppercase' as const }
const kpiValue = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0B4C8C', margin: '0' }
const card = { backgroundColor: '#fbfcfe', border: '1px solid #d9e3ee', borderRadius: '8px', padding: '16px', margin: '18px 0' }
const sectionTitle = { fontSize: '15px', fontWeight: 'bold' as const, color: '#0B4C8C', margin: '0 0 12px', borderBottom: '2px solid #0F6FC6', paddingBottom: '6px' }
const rowTbl = { width: '100%', borderCollapse: 'collapse' as const }
const rowLabel = { fontSize: '13px', color: '#666666', padding: '5px 0', textAlign: 'left' as const }
const rowValue = { fontSize: '13px', color: '#1a1a2e', fontWeight: 'bold' as const, padding: '5px 0', textAlign: 'right' as const }
const tbl = { width: '100%', borderCollapse: 'collapse' as const, margin: '12px 0', fontSize: '12px' }
const th = { textAlign: 'left' as const, padding: '6px 8px', backgroundColor: '#0F6FC6', color: '#ffffff', fontSize: '12px' }
const thR = { ...th, textAlign: 'right' as const }
const td = { padding: '6px 8px', borderBottom: '1px solid #d9e3ee', color: '#333333' }
const tdR = { ...td, textAlign: 'right' as const }
const divider = { borderTop: '1px solid #d9e3ee', margin: '16px 0' }
const footer = { fontSize: '11px', color: '#999999', margin: '0', lineHeight: '1.5' }

export default KycRmReport
