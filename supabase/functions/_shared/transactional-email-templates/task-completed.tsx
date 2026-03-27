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

interface TaskCompletedProps {
  taskTitle?: string
  taskDescription?: string
  completedByName?: string
  dueDate?: string
  completedAt?: string
  recipientName?: string
  recipientRole?: string // 'creator' or 'spectator'
}

const TaskCompletedEmail = ({
  taskTitle = 'Untitled Task',
  taskDescription,
  completedByName,
  dueDate,
  completedAt,
  recipientName,
  recipientRole = 'creator',
}: TaskCompletedProps) => {
  const previewText = `✅ Task Completed: ${taskTitle}`

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

  const formattedCompleted = completedAt
    ? new Date(completedAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null

  const roleMessage = recipientRole === 'spectator'
    ? 'A task you are spectating has been marked as completed.'
    : 'A task you created has been marked as completed.'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Text style={headerText}>ERP Task Management</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>✅ Task Completed</Heading>

            {recipientName && (
              <Text style={text}>Hi {recipientName},</Text>
            )}

            <Text style={text}>{roleMessage}</Text>

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

            {completedByName && (
              <Text style={meta}>👤 Completed by: <strong>{completedByName}</strong></Text>
            )}
            {formattedCompleted && (
              <Text style={meta}>✅ Completed at: <strong>{formattedCompleted}</strong></Text>
            )}
            {formattedDue && (
              <Text style={meta}>📅 Was due: <strong>{formattedDue}</strong></Text>
            )}

            <Hr style={divider} />

            <Text style={footer}>
              This is an automated notification from {SITE_NAME} ERP.
              Please log in to view full details.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TaskCompletedEmail,
  subject: (data: Record<string, any>) =>
    `✅ Task Completed: ${data.taskTitle || 'Task'}`,
  displayName: 'Task Completed',
  previewData: {
    taskTitle: 'Complete Q1 Financial Report',
    taskDescription: 'Please review and finalize the quarterly financial report for stakeholder review.',
    completedByName: 'Abhishek',
    dueDate: '2026-04-01T18:30:00',
    completedAt: '2026-03-28T14:22:00',
    recipientName: 'Shubham',
    recipientRole: 'creator',
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
  color: '#16a34a',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 16px',
}
const taskCard = {
  backgroundColor: '#f0fdf4',
  borderLeft: '4px solid #16a34a',
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
