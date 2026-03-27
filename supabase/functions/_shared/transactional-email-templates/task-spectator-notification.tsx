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

interface TaskSpectatorNotificationProps {
  taskTitle?: string
  taskDescription?: string
  assignedToName?: string
  assignedByName?: string
  dueDate?: string
  status?: string
  recipientName?: string
}

const TaskSpectatorNotificationEmail = ({
  taskTitle = 'Untitled Task',
  taskDescription,
  assignedToName,
  assignedByName,
  dueDate,
  status,
  recipientName,
}: TaskSpectatorNotificationProps) => {
  const previewText = `👁️ You've been added as a spectator: ${taskTitle}`
  const statusLabel = status?.replace('_', ' ').toUpperCase() || ''
  const formattedDue = dueDate
    ? new Date(dueDate).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header bar */}
          <Section style={headerBar}>
            <Text style={headerText}>ERP Task Management</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>👁️ You Are a Spectator</Heading>

            {recipientName && (
              <Text style={text}>Hi {recipientName},</Text>
            )}

            <Text style={text}>
              You have been added as a <strong>spectator</strong> on the following task. You will receive updates but are not required to take action.
            </Text>

            {/* Task card */}
            <Section style={taskCard}>
              <Text style={taskTitle_style}>{taskTitle}</Text>
              {taskDescription && (
                <Text style={taskDesc}>
                  {taskDescription.length > 200
                    ? taskDescription.substring(0, 200) + '…'
                    : taskDescription}
                </Text>
              )}
            </Section>

            {/* Meta info */}
            {assignedToName && (
              <Text style={meta}>👤 Assigned to: <strong>{assignedToName}</strong></Text>
            )}
            {assignedByName && (
              <Text style={meta}>📝 Created by: <strong>{assignedByName}</strong></Text>
            )}
            {formattedDue && (
              <Text style={meta}>📅 Due: <strong>{formattedDue}</strong></Text>
            )}
            {statusLabel && (
              <Text style={meta}>Status: <strong>{statusLabel}</strong></Text>
            )}

            <Hr style={divider} />

            <Text style={footer}>
              This is an automated notification from {SITE_NAME} ERP.
              You are receiving this because you were added as a spectator on this task.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TaskSpectatorNotificationEmail,
  subject: (data: Record<string, any>) =>
    `👁️ Spectator: ${data.taskTitle || 'Task'}`,
  displayName: 'Task Spectator Notification',
  previewData: {
    taskTitle: 'Complete Q1 Financial Report',
    taskDescription: 'Please review and finalize the quarterly financial report for stakeholder review.',
    assignedToName: 'Abhishek',
    assignedByName: 'Shubham Singh',
    dueDate: '2026-04-01T18:30:00',
    status: 'open',
    recipientName: 'Ravi',
  },
} satisfies TemplateEntry

// Styles
const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto' }
const headerBar = {
  backgroundColor: '#1a1a2e',
  padding: '20px 30px',
  borderRadius: '8px 8px 0 0',
}
const headerText = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  margin: '0',
}
const content = { padding: '30px' }
const h1 = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#1a1a2e',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 16px',
}
const taskCard = {
  backgroundColor: '#f8f9fa',
  borderLeft: '4px solid #f59e0b',
  padding: '16px',
  borderRadius: '0 6px 6px 0',
  margin: '16px 0',
}
const taskTitle_style = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#1a1a2e',
  margin: '0 0 8px',
}
const taskDesc = {
  fontSize: '13px',
  color: '#666666',
  lineHeight: '1.5',
  margin: '0',
}
const meta = {
  fontSize: '13px',
  color: '#555555',
  margin: '6px 0',
}
const divider = { borderTop: '1px solid #eeeeee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
