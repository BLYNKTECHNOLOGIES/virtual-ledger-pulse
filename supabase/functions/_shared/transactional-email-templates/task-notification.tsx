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
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'BLYNK Virtual Technologies'

interface TaskNotificationProps {
  eventType?: string
  taskTitle?: string
  taskDescription?: string
  assignedByName?: string
  dueDate?: string
  status?: string
  recipientName?: string
}

const eventHeaders: Record<string, string> = {
  task_assigned: '📋 New Task Assigned',
  task_reassigned: '🔄 Task Reassigned',
  task_overdue: '⚠️ Task Overdue',
  task_due_soon: '⏰ Task Due Soon',
  task_mention: '💬 You Were Mentioned',
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
  const header = eventHeaders[eventType] || 'Task Update'
  const previewText = `${header}: ${taskTitle}`
  const statusLabel = status?.replace('_', ' ').toUpperCase() || ''
  const formattedDue = dueDate
    ? new Date(dueDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
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
            <Heading style={h1}>{header}</Heading>

            {recipientName && (
              <Text style={text}>Hi {recipientName},</Text>
            )}

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
            {formattedDue && (
              <Text style={meta}>📅 Due: <strong>{formattedDue}</strong></Text>
            )}
            {assignedByName && (
              <Text style={meta}>
                👤 {eventType === 'task_reassigned' ? 'Reassigned' : 'Assigned'} by: <strong>{assignedByName}</strong>
              </Text>
            )}
            {statusLabel && (
              <Text style={meta}>Status: <strong>{statusLabel}</strong></Text>
            )}

            <Hr style={divider} />

            <Text style={footer}>
              This is an automated notification from {SITE_NAME} ERP.
              Please log in to view full details and take action.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TaskNotificationEmail,
  subject: (data: Record<string, any>) => {
    const subjects: Record<string, string> = {
      task_assigned: `📋 New Task Assigned: ${data.taskTitle || 'Task'}`,
      task_reassigned: `🔄 Task Reassigned: ${data.taskTitle || 'Task'}`,
      task_overdue: `⚠️ Task Overdue: ${data.taskTitle || 'Task'}`,
      task_due_soon: `⏰ Task Due Soon: ${data.taskTitle || 'Task'}`,
      task_mention: `💬 You were mentioned: ${data.taskTitle || 'Task'}`,
    }
    return subjects[data.eventType] || `Task Update: ${data.taskTitle || 'Task'}`
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
  borderLeft: '4px solid #4361ee',
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
