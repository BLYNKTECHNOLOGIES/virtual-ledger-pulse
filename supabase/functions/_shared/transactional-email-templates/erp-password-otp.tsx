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

interface ErpPasswordOtpProps {
  otp?: string
  recipientName?: string
  expiryMinutes?: number
}

const ErpPasswordOtpEmail = ({
  otp = '000000',
  recipientName,
  expiryMinutes = 10,
}: ErpPasswordOtpProps) => {
  const previewText = `Your ERP password reset code is ${otp}`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Text style={headerText}>ERP Password Reset</Text>
          </Section>

          <Section style={content}>
            <Heading style={h1}>Reset your password</Heading>

            {recipientName && <Text style={text}>Hi {recipientName},</Text>}

            <Text style={text}>
              We received a request to reset the password for your {SITE_NAME} ERP
              account. Use the verification code below to continue.
            </Text>

            <Section style={otpCard}>
              <Text style={otpCode}>{otp}</Text>
            </Section>

            <Text style={text}>
              This code expires in <strong>{expiryMinutes} minutes</strong>. For your
              security, never share it with anyone.
            </Text>

            <Hr style={divider} />

            <Text style={footer}>
              If you did not request a password reset, you can safely ignore this
              email — your password will remain unchanged.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ErpPasswordOtpEmail,
  subject: (data: Record<string, any>) =>
    `Your ERP password reset code: ${data.otp || ''}`,
  displayName: 'ERP Password Reset OTP',
  previewData: {
    otp: '482913',
    recipientName: 'Shubham',
    expiryMinutes: 10,
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
const otpCard = {
  backgroundColor: '#eef2ff',
  borderLeft: '4px solid #4f46e5',
  padding: '20px',
  borderRadius: '0 6px 6px 0',
  margin: '20px 0',
  textAlign: 'center' as const,
}
const otpCode = {
  fontSize: '34px',
  fontWeight: 'bold' as const,
  letterSpacing: '10px',
  color: '#1a1a2e',
  margin: '0',
}
const divider = { borderTop: '1px solid #eeeeee', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
