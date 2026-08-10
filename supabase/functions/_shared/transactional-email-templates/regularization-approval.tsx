/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://erp.blynkex.com'

interface RegProps {
  eventType?: string
  requestId?: string
  recipientRole?: string
  recipientName?: string
  employeeName?: string
  attendanceDate?: string
  requestedIn?: string
  requestedOut?: string
  reasonCategory?: string
  reason?: string
  managerRecommendation?: string
  managerRemarks?: string
  decidedBy?: string
  approverNotes?: string
}

const meta: Record<string, { label: string; intro: (p: RegProps) => string; cta: string; accent: string }> = {
  reg_requested: {
    label: 'Attendance regularization needs HR review',
    intro: (p) => `${p.employeeName || 'An employee'} raised an attendance regularization request.`,
    cta: 'Open HRMS',
    accent: '#E8604C',
  },
  reg_pushed_to_manager: {
    label: 'Attendance regularization needs your confirmation',
    intro: (p) => `HR has forwarded ${p.employeeName || 'an employee'}'s attendance regularization to you for confirmation.`,
    cta: 'Review in ERP',
    accent: '#2563eb',
  },
  reg_manager_decided: {
    label: 'Regularization returned by reporting manager',
    intro: (p) => `The reporting manager has recorded a decision on ${p.employeeName || 'an employee'}'s regularization. HR approval is now required.`,
    cta: 'Open HRMS',
    accent: '#2563eb',
  },
  reg_approved: {
    label: 'Your attendance regularization is approved',
    intro: () => 'HR has approved your attendance regularization request.',
    cta: 'View my requests',
    accent: '#16a34a',
  },
  reg_rejected: {
    label: 'Your attendance regularization was rejected',
    intro: () => 'HR did not approve your attendance regularization request.',
    cta: 'View my requests',
    accent: '#dc2626',
  },
}

function RegularizationEmail(props: RegProps) {
  const m = meta[props.eventType || 'reg_requested'] || meta.reg_requested
  const link =
    props.recipientRole === 'hr'
      ? `${APP_URL}/hrms/attendance/regularization`
      : props.recipientRole === 'manager'
        ? `${APP_URL}/profile?tab=requests&regId=${props.requestId || ''}`
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
            {row('Date', props.attendanceDate)}
            {row('Requested in', props.requestedIn)}
            {row('Requested out', props.requestedOut)}
            {row('Category', props.reasonCategory)}
            {row('Reason', props.reason)}
            {row('Manager recommendation', props.managerRecommendation)}
            {row('Manager remarks', props.managerRemarks)}
            {row('Decided by', props.decidedBy)}
            {row('HR notes', props.approverNotes)}
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
  component: RegularizationEmail,
  displayName: 'Attendance regularization',
  subject: (data) => {
    const m = meta[data?.eventType || 'reg_requested'] || meta.reg_requested
    const who = data?.employeeName ? ` — ${data.employeeName}` : ''
    return `${m.label}${who}`
  },
  previewData: {
    eventType: 'reg_requested',
    employeeName: 'Priyanka Thakur',
    attendanceDate: '2026-08-09',
    requestedIn: '10:00',
    requestedOut: '19:00',
    reasonCategory: 'Missed punch',
    reason: 'Device was offline at the gate',
    recipientRole: 'hr',
  },
}
