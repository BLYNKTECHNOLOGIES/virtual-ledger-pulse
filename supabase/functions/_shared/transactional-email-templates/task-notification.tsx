/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Row,
  Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Blynkex'
const APP_URL = 'https://erp.blynkex.com'
const LOGO_URL = 'https://erp.blynkex.com/__l5e/assets-v1/b6b06bc5-e6c4-4625-b9d1-57b258a7be69/blynkex-logo.svg'


interface TaskNotificationProps {
  eventType?: string
  taskTitle?: string
  taskDescription?: string
  assignedByName?: string
  dueDate?: string
  status?: string
  recipientName?: string
}

interface EventMeta {
  emoji: string
  label: string
  intro: (assigner?: string) => string
  accent: string      // primary accent for gradient / borders
  accentSoft: string  // soft tint for backgrounds
  cta: string
}

const eventMeta: Record<string, EventMeta> = {
  task_assigned: {
    emoji: '📋',
    label: 'New Task Assigned',
    intro: (a) => a ? `${a} has assigned a new task to you.` : 'A new task has been assigned to you.',
    accent: '#4361ee',
    accentSoft: '#eef1ff',
    cta: 'Open Task',
  },
  task_reassigned: {
    emoji: '🔄',
    label: 'Task Reassigned to You',
    intro: (a) => a ? `${a} has reassigned this task to you.` : 'This task has been reassigned to you.',
    accent: '#7c3aed',
    accentSoft: '#f2ecff',
    cta: 'Review Task',
  },
  task_overdue: {
    emoji: '⚠️',
    label: 'Task Overdue',
    intro: () => 'This task has passed its due date and still needs your attention.',
    accent: '#dc2626',
    accentSoft: '#fdecec',
    cta: 'Resolve Now',
  },
  task_due_soon: {
    emoji: '⏰',
    label: 'Task Due Soon',
    intro: () => 'Heads up — this task is coming up on its deadline.',
    accent: '#d97706',
    accentSoft: '#fdf3e2',
    cta: 'View Task',
  },
  task_mention: {
    emoji: '💬',
    label: 'You Were Mentioned',
    intro: (a) => a ? `${a} mentioned you in a task discussion.` : 'You were mentioned in a task discussion.',
    accent: '#0891b2',
    accentSoft: '#e6f6fa',
    cta: 'Jump to Thread',
  },
}

const TaskNotificationEmail = ({
  eventType = 'task_assigned',
  taskTitle = 'Untitled Task',
  taskDescription,
  assignedByName,
  dueDate,
  status,
  recipientName,
}: TaskNotificationProps) => {
  const meta = eventMeta[eventType] || eventMeta.task_assigned
  const previewText = assignedByName && (eventType === 'task_assigned' || eventType === 'task_reassigned')
    ? `${assignedByName} → ${taskTitle}`
    : `${meta.label}: ${taskTitle}`

  const statusLabel = status?.replace(/_/g, ' ').toUpperCase() || ''
  const formattedDue = dueDate
    ? new Date(dueDate).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
    : null

  const initials = (assignedByName || 'BX')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Brand header */}
          <Section style={{ ...brandHeader, background: `linear-gradient(135deg, ${meta.accent} 0%, #0b1024 100%)` }}>
            <Row>
              <Column style={{ width: '52px', verticalAlign: 'middle' as const }}>
                <img
                  src={LOGO_URL}
                  alt="Blynkex"
                  width="40"
                  height="40"
                  style={{ display: 'block', width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.14)', padding: '4px' }}
                />
              </Column>
              <Column style={{ verticalAlign: 'middle' as const }}>
                <div style={brandName}>BLYNKEX</div>
                <div style={brandTag}>Enterprise Resource Platform</div>
              </Column>
              <Column align="right" style={{ verticalAlign: 'middle' as const }}>
                <span style={eyebrow}>{meta.emoji} Tasks</span>
              </Column>
            </Row>
          </Section>


          {/* Content */}
          <Section style={content}>
            <Text style={eventLabel}>{meta.label.toUpperCase()}</Text>
            <Heading style={h1}>{taskTitle}</Heading>

            <Text style={intro}>
              {recipientName ? `Hi ${recipientName.split(' ')[0]}, ` : ''}
              {meta.intro(assignedByName)}
            </Text>

            {/* Assigner callout */}
            {assignedByName && (eventType === 'task_assigned' || eventType === 'task_reassigned' || eventType === 'task_mention') && (
              <Section style={{ ...assignerCard, backgroundColor: meta.accentSoft, borderLeft: `3px solid ${meta.accent}` }}>
                <Row>
                  <Column style={{ width: '44px' }}>
                    <div style={{ ...avatar, backgroundColor: meta.accent }}>{initials}</div>
                  </Column>
                  <Column>
                    <Text style={assignerFrom}>From</Text>
                    <Text style={assignerName}>{assignedByName}</Text>
                  </Column>
                </Row>
              </Section>
            )}

            {/* Description */}
            {taskDescription && (
              <Section style={descCard}>
                <Text style={descLabel}>DETAILS</Text>
                <Text style={descText}>
                  {taskDescription.length > 280
                    ? taskDescription.substring(0, 280) + '…'
                    : taskDescription}
                </Text>
              </Section>
            )}

            {/* Meta grid */}
            <Section style={metaGrid}>
              {formattedDue && (
                <Row style={metaRow}>
                  <Column style={metaKeyCol}><Text style={metaKey}>📅 Due</Text></Column>
                  <Column><Text style={metaVal}>{formattedDue} IST</Text></Column>
                </Row>
              )}
              {statusLabel && (
                <Row style={metaRow}>
                  <Column style={metaKeyCol}><Text style={metaKey}>◉ Status</Text></Column>
                  <Column>
                    <span style={{ ...statusPill, backgroundColor: meta.accentSoft, color: meta.accent, borderColor: meta.accent }}>
                      {statusLabel}
                    </span>
                  </Column>
                </Row>
              )}
            </Section>

            {/* CTA */}
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button
                href={`${APP_URL}/tasks`}
                style={{ ...ctaBtn, backgroundColor: meta.accent }}
              >
                {meta.cta} →
              </Button>
            </Section>

            <Hr style={divider} />

            <Text style={footer}>
              You're receiving this because you're part of the {SITE_NAME} team.
              <br />
              Sign in to <a href={APP_URL} style={{ color: meta.accent, textDecoration: 'none' }}>erp.blynkex.com</a> to respond.
            </Text>
          </Section>

          <Text style={legalFooter}>
            © {new Date().getFullYear()} BLYNK Virtual Technologies · Automated Task Notification
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TaskNotificationEmail,
  subject: (data: Record<string, any>) => {
    const title = data.taskTitle || 'Task'
    const by = data.assignedByName ? ` - from ${data.assignedByName}` : ''
    const subjects: Record<string, string> = {
      task_assigned: `[Task] New: ${title}${by}`,
      task_reassigned: `[Task] Reassigned to you: ${title}${by}`,
      task_overdue: `[Task] Overdue - action needed: ${title}`,
      task_due_soon: `[Task] Due soon: ${title}`,
      task_mention: `[Task] ${data.assignedByName ? `${data.assignedByName} mentioned you` : 'You were mentioned'}: ${title}`,
    }
    return subjects[data.eventType] || `[Task] Update: ${title}`
  },
  displayName: 'Task Notification',
  previewData: {
    eventType: 'task_assigned',
    taskTitle: 'Complete Q1 Financial Report',
    taskDescription: 'Please review and finalize the quarterly financial report for stakeholder review.',
    assignedByName: 'Shubham Singh',
    dueDate: '2026-04-01T23:59:00',
    status: 'open',
    recipientName: 'Abhishek',
  },
} satisfies TemplateEntry

// Styles
const main = {
  backgroundColor: '#f4f5f9',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  padding: '24px 12px',
}
const container = {
  maxWidth: '580px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  overflow: 'hidden' as const,
  boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
}
const brandHeader = {
  padding: '22px 28px',
  color: '#ffffff',
}
const brandMark = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  backgroundColor: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.25)',
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: 800 as const,
  lineHeight: '34px',
  textAlign: 'center' as const,
  letterSpacing: '-0.5px',
}
const brandName = {
  color: '#ffffff',
  WebkitTextFillColor: '#ffffff',
  fontSize: '18px',
  fontWeight: 800 as const,
  letterSpacing: '3px',
  margin: '0',
  lineHeight: '1.1',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const brandTag = {
  color: '#e0e7ff',
  WebkitTextFillColor: '#e0e7ff',
  fontSize: '11px',
  margin: '3px 0 0',
  letterSpacing: '0.5px',
  fontWeight: 500 as const,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const eyebrow = {
  color: '#ffffff',
  WebkitTextFillColor: '#ffffff',
  fontSize: '12px',
  fontWeight: 700 as const,
  padding: '5px 12px',
  backgroundColor: 'rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '999px',
  display: 'inline-block' as const,
  whiteSpace: 'nowrap' as const,
}

const content = { padding: '28px 28px 20px' }
const eventLabel = {
  fontSize: '11px',
  fontWeight: 700 as const,
  color: '#64748b',
  letterSpacing: '1.5px',
  margin: '0 0 6px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 700 as const,
  color: '#0f172a',
  margin: '0 0 14px',
  lineHeight: '1.3',
  letterSpacing: '-0.3px',
}
const intro = {
  fontSize: '14px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const assignerCard = {
  padding: '12px 14px',
  borderRadius: '10px',
  margin: '0 0 18px',
}
const avatar = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  color: '#ffffff',
  fontSize: '13px',
  fontWeight: 700 as const,
  lineHeight: '36px',
  textAlign: 'center' as const,
  letterSpacing: '0.5px',
}
const assignerFrom = {
  fontSize: '10px',
  color: '#64748b',
  letterSpacing: '1px',
  fontWeight: 600 as const,
  margin: '0',
  textTransform: 'uppercase' as const,
}
const assignerName = {
  fontSize: '15px',
  color: '#0f172a',
  fontWeight: 600 as const,
  margin: '1px 0 0',
}
const descCard = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
  borderRadius: '10px',
  margin: '0 0 18px',
}
const descLabel = {
  fontSize: '10px',
  color: '#64748b',
  letterSpacing: '1.2px',
  fontWeight: 700 as const,
  margin: '0 0 6px',
}
const descText = {
  fontSize: '14px',
  color: '#334155',
  lineHeight: '1.6',
  margin: '0',
}
const metaGrid = { margin: '4px 0 8px' }
const metaRow = { padding: '6px 0' }
const metaKeyCol = { width: '90px', verticalAlign: 'top' as const }
const metaKey = {
  fontSize: '13px',
  color: '#64748b',
  margin: '0',
  fontWeight: 500 as const,
}
const metaVal = {
  fontSize: '13px',
  color: '#0f172a',
  margin: '0',
  fontWeight: 600 as const,
}
const statusPill = {
  fontSize: '11px',
  fontWeight: 700 as const,
  padding: '3px 10px',
  borderRadius: '999px',
  border: '1px solid',
  letterSpacing: '0.5px',
  display: 'inline-block' as const,
}
const ctaBtn = {
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  padding: '12px 28px',
  borderRadius: '10px',
  textDecoration: 'none',
  display: 'inline-block' as const,
  letterSpacing: '0.2px',
}
const divider = { borderTop: '1px solid #e2e8f0', margin: '24px 0 16px' }
const footer = {
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: '1.6',
  margin: '0',
  textAlign: 'center' as const,
}
const legalFooter = {
  fontSize: '11px',
  color: '#94a3b8',
  textAlign: 'center' as const,
  margin: '16px 0 0',
  padding: '0 20px',
}
