/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://erp.blynkex.com'

interface LeaveApprovalProps {
  eventType?: string
  requestId?: string
  recipientRole?: string
  recipientName?: string
  employeeName?: string
  leaveType?: string
  startDate?: string
  endDate?: string
  totalDays?: number | string
  reason?: string
  contactDuringLeave?: string
  balanceNote?: string
  decidedBy?: string
}

const meta: Record<string, { label: string; intro: (p: LeaveApprovalProps) => string; cta: string; accent: string }> = {
  leave_requested: {
    label: 'Leave approval needed',
    intro: (p) => `${p.employeeName || 'An employee'} has submitted a leave request.`,
    cta: 'Review in ERP',
    accent: '#E8604C',
  },
  leave_manager_approved: {
    label: 'Leave ready for HR approval',
    intro: (p) => `${p.employeeName || 'An employee'}'s leave was approved by the reporting manager and now needs HR approval.`,
    cta: 'Open HRMS',
    accent: '#2563eb',
  },
  leave_approved: {
    label: 'Your leave is approved',
    intro: () => 'Your leave request has been approved by HR.',
    cta: 'View my requests',
    accent: '#16a34a',
  },
  leave_rejected: {
    label: 'Your leave was rejected',
    intro: () => 'Your leave request was not approved.',
    cta: 'View my requests',
    accent: '#dc2626',
  },
}

function LeaveApprovalEmail(props: LeaveApprovalProps) {
  const m = meta[props.eventType || 'leave_requested'] || meta.leave_requested
  const link =
    props.recipientRole === 'hr'
      ? `${APP_URL}/hrms/leave/requests`
      : props.recipientRole === 'manager'
        ? `${APP_URL}/profile?tab=requests&leaveId=${props.requestId || ''}`
        : `${APP_URL}/profile?tab=requests`

  const row = (k: string, v?: string | number) =>
    v === undefined || v === null || v === '' ? null : (
      <Text style={{ margin: '2px 0', fontSize: '14px', color: '#334155' }}>
        <span style={{ color: '#64748b' }}>{k}: </span>
        <strong>{String(v)}</strong>
      </Text>
    )

  return (
    <Html>
      <Head />
      <Preview>{m.label}</Preview>
      <Body style={{ backgroundColor: '#f8fafc', fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif', margin: 0, padding: '24px' }}>
        <Container style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '28px', maxWidth: '560px', border: '1px solid #e2e8f0' }}>
          <Heading style={{ fontSize: '18px', margin: '0 0 6px', color: m.accent }}>{m.label}</Heading>
          <Text style={{ fontSize: '14px', color: '#475569', marginTop: 0 }}>{m.intro(props)}</Text>
          <Hr style={{ borderColor: '#e2e8f0', margin: '16px 0' }} />
          <Section>
            {row('Employee', props.employeeName)}
            {row('Leave type', props.leaveType)}
            {row('From', props.startDate)}
            {row('To', props.endDate)}
            {row('Days', props.totalDays)}
            {row('Reason', props.reason)}
            {row('Contact during leave', props.contactDuringLeave)}
            {row('Balance', props.balanceNote)}
            {row('Decided by', props.decidedBy)}
          </Section>
          <Section style={{ marginTop: '20px' }}>
            <Button
              href={link}
              style={{ backgroundColor: m.accent, color: '#ffffff', padding: '10px 18px', borderRadius: '8px', fontSize: '14px', textDecoration: 'none' }}
            >
              {m.cta}
            </Button>
          </Section>
          <Text style={{ fontSize: '11px', color: '#94a3b8', marginTop: '20px' }}>
            Blynkex HRMS · automated message
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: LeaveApprovalEmail,
  displayName: 'Leave approval',
  subject: (data) => {
    const m = meta[data?.eventType || 'leave_requested'] || meta.leave_requested
    const who = data?.employeeName ? ` — ${data.employeeName}` : ''
    return `${m.label}${who}`
  },
  previewData: {
    eventType: 'leave_requested',
    employeeName: 'Priyanka Thakur',
    leaveType: 'Casual Leave',
    startDate: '2026-08-25',
    endDate: '2026-08-27',
    totalDays: 3,
    reason: 'Family function',
    recipientRole: 'manager',
  },
}
