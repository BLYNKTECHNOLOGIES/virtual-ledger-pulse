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

/* Blynk brand tokens (email-safe hex of the ERP design system) */
const INK = '#04121F'
const INK_SOFT = '#0A2233'
const CYAN = '#00A3D1' // primary  hsl(193 100% 41%)
const CYAN_BRIGHT = '#22D3EE'
const SKY = '#5CC6E8'
const SLATE = '#5B6B7B'
const SLATE_DEEP = '#0F1D2A'
const LINE = '#E3EAF0'

const DISPLAY_FONT = 'Montserrat, "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif'
const BODY_FONT = 'Manrope, "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif'
const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace'

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
  accent: string      // primary accent for borders / CTA
  accentSoft: string  // soft tint for backgrounds
  cta: string
}

const eventMeta: Record<string, EventMeta> = {
  task_assigned: {
    emoji: '',
    label: 'New Task Assigned',
    intro: (a) => a ? `${a} has assigned a new task to you.` : 'A new task has been assigned to you.',
    accent: CYAN,
    accentSoft: '#E6F6FB',
    cta: 'Open Task',
  },
  task_reassigned: {
    emoji: '',
    label: 'Task Reassigned to You',
    intro: (a) => a ? `${a} has reassigned this task to you.` : 'This task has been reassigned to you.',
    accent: '#0E7490',
    accentSoft: '#E4F4F8',
    cta: 'Review Task',
  },
  task_overdue: {
    emoji: '',
    label: 'Task Overdue',
    intro: () => 'This task has passed its due date and still needs your attention.',
    accent: '#DC2626',
    accentSoft: '#FDECEC',
    cta: 'Resolve Now',
  },
  task_due_soon: {
    emoji: '',
    label: 'Task Due Soon',
    intro: () => 'Heads up — this task is coming up on its deadline.',
    accent: '#B45309',
    accentSoft: '#FDF3E2',
    cta: 'View Task',
  },
  task_mention: {
    emoji: '',
    label: 'You Were Mentioned',
    intro: (a) => a ? `${a} mentioned you in a task discussion.` : 'You were mentioned in a task discussion.',
    accent: '#0891B2',
    accentSoft: '#E6F6FA',
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
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Brand header — Blynk ink → cyan */}
          <Section style={brandHeader}>
            <Row>
              <Column style={{ width: '54px', verticalAlign: 'middle' as const }}>
                <div style={logoPlate}>
                  <img
                    src={LOGO_URL}
                    alt="Blynkex"
                    width="34"
                    height="34"
                    style={{ display: 'block', width: '34px', height: '34px' }}
                  />
                </div>
              </Column>
              <Column style={{ verticalAlign: 'middle' as const, paddingLeft: '2px' }}>
                <div style={brandName}>
                  <span style={{ color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF' }}>BLYNK</span>
                  <span style={{ color: CYAN_BRIGHT, WebkitTextFillColor: CYAN_BRIGHT }}>EX</span>
                </div>
                <div style={brandTag}>Enterprise Resource Platform</div>
              </Column>
              <Column align="right" style={{ verticalAlign: 'middle' as const }}>
                <span style={eyebrow}>Tasks</span>
              </Column>
            </Row>
          </Section>
          {/* Cyan accent rule under the header */}
          <div style={accentRule} />

          {/* Content */}
          <Section style={content}>
            <Text style={{ ...eventLabel, color: meta.accent }}>{meta.label.toUpperCase()}</Text>
            <Heading style={h1}>{taskTitle}</Heading>

            <Text style={intro}>
              {recipientName ? `Hi ${recipientName.split(' ')[0]}, ` : ''}
              {meta.intro(assignedByName)}
            </Text>

            {/* Assigner callout */}
            {assignedByName && (eventType === 'task_assigned' || eventType === 'task_reassigned' || eventType === 'task_mention') && (
              <Section style={{ ...assignerCard, backgroundColor: meta.accentSoft, borderLeft: `3px solid ${meta.accent}` }}>
                <Row>
                  <Column style={{ width: '46px', verticalAlign: 'middle' as const }}>
                    <div style={{ ...avatar, backgroundColor: meta.accent }}>{initials}</div>
                  </Column>
                  <Column style={{ verticalAlign: 'middle' as const }}>
                    <Text style={assignerFrom}>Assigned by</Text>
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

            {/* Meta panel */}
            {(formattedDue || statusLabel) && (
              <Section style={metaGrid}>
                {formattedDue && (
                  <Row style={metaRow}>
                    <Column style={metaKeyCol}><Text style={metaKey}>DUE</Text></Column>
                    <Column><Text style={metaVal}>{formattedDue} IST</Text></Column>
                  </Row>
                )}
                {statusLabel && (
                  <Row style={metaRow}>
                    <Column style={metaKeyCol}><Text style={metaKey}>STATUS</Text></Column>
                    <Column>
                      <span style={{ ...statusPill, backgroundColor: meta.accentSoft, color: meta.accent, borderColor: meta.accent }}>
                        {statusLabel}
                      </span>
                    </Column>
                  </Row>
                )}
              </Section>
            )}

            {/* CTA */}
            <Section style={{ margin: '26px 0 6px' }}>
              <Row>
                <Column align="center">
                  <Button
                    href={`${APP_URL}/tasks`}
                    style={{ ...ctaBtn, backgroundColor: meta.accent }}
                  >
                    {meta.cta} &nbsp;›
                  </Button>
                </Column>
              </Row>
            </Section>

            <Hr style={divider} />

            <Text style={footer}>
              You're receiving this because you're part of the {SITE_NAME} team.
              <br />
              Sign in to <a href={APP_URL} style={{ color: meta.accent, textDecoration: 'none', fontWeight: 600 }}>erp.blynkex.com</a> to respond.
            </Text>
          </Section>

          <Text style={legalFooter}>
            © {new Date().getFullYear()} Blynkex · Automated Task Notification
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
  backgroundColor: '#F1F5F8',
  fontFamily: BODY_FONT,
  padding: '24px 12px',
}
const container = {
  maxWidth: '580px',
  margin: '0 auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  overflow: 'hidden' as const,
  border: `1px solid ${LINE}`,
  boxShadow: '0 6px 28px rgba(4, 18, 31, 0.07)',
}
const brandHeader = {
  padding: '20px 26px',
  color: '#FFFFFF',
  background: `linear-gradient(120deg, ${INK} 0%, ${INK_SOFT} 42%, #0B5B78 78%, ${CYAN} 100%)`,
  backgroundColor: INK,
}
const logoPlate = {
  width: '42px',
  height: '42px',
  borderRadius: '12px',
  background: 'rgba(34, 211, 238, 0.16)',
  border: '1px solid rgba(34, 211, 238, 0.42)',
  padding: '4px',
}
const brandName = {
  color: '#FFFFFF',
  WebkitTextFillColor: '#FFFFFF',
  fontSize: '18px',
  fontWeight: 800 as const,
  letterSpacing: '3px',
  margin: '0',
  lineHeight: '1.1',
  fontFamily: DISPLAY_FONT,
}
const brandTag = {
  color: '#A8D8E8',
  WebkitTextFillColor: '#A8D8E8',
  fontSize: '10px',
  margin: '5px 0 0',
  letterSpacing: '1.4px',
  fontWeight: 600 as const,
  fontFamily: BODY_FONT,
  textTransform: 'uppercase' as const,
}
const eyebrow = {
  color: CYAN_BRIGHT,
  WebkitTextFillColor: CYAN_BRIGHT,
  fontSize: '10px',
  fontWeight: 700 as const,
  letterSpacing: '1.4px',
  textTransform: 'uppercase' as const,
  padding: '5px 12px',
  backgroundColor: 'rgba(34, 211, 238, 0.14)',
  border: '1px solid rgba(34, 211, 238, 0.4)',
  borderRadius: '999px',
  display: 'inline-block' as const,
  whiteSpace: 'nowrap' as const,
  fontFamily: BODY_FONT,
}
const accentRule = {
  height: '3px',
  background: `linear-gradient(90deg, ${CYAN_BRIGHT} 0%, ${CYAN} 55%, ${SKY} 100%)`,
  backgroundColor: CYAN,
}

const content = { padding: '26px 26px 20px' }
const eventLabel = {
  fontSize: '10px',
  fontWeight: 700 as const,
  letterSpacing: '1.6px',
  margin: '0 0 8px',
  fontFamily: BODY_FONT,
}
const h1 = {
  fontSize: '22px',
  fontWeight: 700 as const,
  color: SLATE_DEEP,
  margin: '0 0 12px',
  lineHeight: '1.3',
  letterSpacing: '-0.3px',
  fontFamily: DISPLAY_FONT,
}
const intro = {
  fontSize: '14px',
  color: SLATE,
  lineHeight: '1.65',
  margin: '0 0 20px',
}
const assignerCard = {
  padding: '12px 14px',
  borderRadius: '12px',
  margin: '0 0 18px',
}
const avatar = {
  width: '38px',
  height: '38px',
  borderRadius: '50%',
  color: '#FFFFFF',
  fontSize: '13px',
  fontWeight: 700 as const,
  lineHeight: '38px',
  textAlign: 'center' as const,
  letterSpacing: '0.5px',
  fontFamily: DISPLAY_FONT,
}
const assignerFrom = {
  fontSize: '9px',
  color: SLATE,
  letterSpacing: '1.3px',
  fontWeight: 700 as const,
  margin: '0',
  textTransform: 'uppercase' as const,
}
const assignerName = {
  fontSize: '15px',
  color: SLATE_DEEP,
  fontWeight: 700 as const,
  margin: '2px 0 0',
  fontFamily: DISPLAY_FONT,
}
const descCard = {
  backgroundColor: '#F7FAFC',
  border: `1px solid ${LINE}`,
  padding: '14px 16px',
  borderRadius: '12px',
  margin: '0 0 18px',
}
const descLabel = {
  fontSize: '9px',
  color: SLATE,
  letterSpacing: '1.4px',
  fontWeight: 700 as const,
  margin: '0 0 6px',
}
const metaGrid = {
  margin: '4px 0 6px',
  border: `1px solid ${LINE}`,
  borderRadius: '12px',
  padding: '6px 14px',
  backgroundColor: '#FBFDFE',
}
const descText = {
  fontSize: '14px',
  color: '#33475B',
  lineHeight: '1.6',
  margin: '0',
}
const metaRow = { padding: '8px 0' }
const metaKeyCol = { width: '82px', verticalAlign: 'middle' as const }
const metaKey = {
  fontSize: '9px',
  color: SLATE,
  margin: '0',
  fontWeight: 700 as const,
  letterSpacing: '1.3px',
}
const metaVal = {
  fontSize: '13px',
  color: SLATE_DEEP,
  margin: '0',
  fontWeight: 600 as const,
  fontFamily: MONO_FONT,
}
const statusPill = {
  fontSize: '10px',
  fontWeight: 700 as const,
  padding: '4px 11px',
  borderRadius: '999px',
  border: '1px solid',
  letterSpacing: '1px',
  display: 'inline-block' as const,
  fontFamily: BODY_FONT,
}
const ctaBtn = {
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: 700 as const,
  padding: '13px 30px',
  borderRadius: '12px',
  textDecoration: 'none',
  display: 'inline-block' as const,
  letterSpacing: '0.3px',
  fontFamily: BODY_FONT,
}
const divider = { borderTop: `1px solid ${LINE}`, margin: '24px 0 16px' }
const footer = {
  fontSize: '12px',
  color: '#8195A6',
  lineHeight: '1.6',
  margin: '0',
  textAlign: 'center' as const,
}
const legalFooter = {
  fontSize: '10px',
  color: '#93A5B4',
  textAlign: 'center' as const,
  margin: '16px 0 0',
  padding: '0 20px',
  letterSpacing: '0.4px',
}
