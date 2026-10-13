import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyMessage, emailKey, type MailHeader, type ThreadRef } from '../_shared/ats-mail.ts'

const CAND = '11111111-1111-1111-1111-111111111111'
const APP = '22222222-2222-2222-2222-222222222222'
const OUR = '<ats.33333333-3333-3333-3333-333333333333@blynkex.com>'

const header = (from: string, inReplyTo: string[] = []): MailHeader => ({
  fromAddress: from, fromName: null, replyTo: null, to: ['hr@blynkex.com'], cc: [], subject: 'Re: Interview',
  date: null, messageId: '<x@example.com>', inReplyTo, references: [], automatic: false, nullSender: false,
})
const ctx = () => ({
  selfAddresses: new Set(['hr@blynkex.com']),
  threadByRef: new Map<string, ThreadRef>([[OUR, { candidateId: CAND, applicationId: APP }]]),
  candidateByEmail: new Map([['rahulsharma@gmail.com', CAND]]),
  candidateByKey: new Map([['rahulsharma@gmail.com', CAND]]),
  internalDomains: new Set(['blynkex.com']),
  employeeAddresses: new Set<string>(),
})

Deno.test('emailKey matches the SQL rule', () => {
  assertEquals(emailKey('Rahul.Sharma+jobs@GMAIL.com'), 'rahulsharma@gmail.com')
  assertEquals(emailKey('a.b+x@yahoo.co.in'), 'a.b@yahoo.co.in')
  assertEquals(emailKey('r.s@googlemail.com'), 'rs@gmail.com')
})

Deno.test('reply from the saved address -> match via sender', () => {
  assertEquals(classifyMessage(header('rahulsharma@gmail.com'), ctx()),
    { kind: 'match', candidateId: CAND, applicationId: null, via: 'sender' })
})

Deno.test('saved address in the same ATS thread keeps the thread application', () => {
  assertEquals(classifyMessage(header('rahulsharma@gmail.com', [OUR]), ctx()),
    { kind: 'match', candidateId: CAND, applicationId: APP, via: 'thread' })
})

Deno.test('dotted Gmail variant -> match via email key', () => {
  assertEquals(classifyMessage(header('rahul.sharma+jobs@gmail.com'), ctx()),
    { kind: 'match', candidateId: CAND, applicationId: null, via: 'sender' })
})

Deno.test('colleague replies in an ATS thread -> internal', () => {
  assertEquals(classifyMessage(header('colleague@blynkex.com', [OUR]), ctx()), { kind: 'internal' })
})

Deno.test('employee on another domain replies in an ATS thread -> internal', () => {
  const c = ctx()
  c.employeeAddresses.add('staff@outlook.com')
  assertEquals(classifyMessage(header('staff@outlook.com', [OUR]), c), { kind: 'internal' })
})

Deno.test('unknown address in an ATS thread -> match with otherAddress', () => {
  assertEquals(classifyMessage(header('someone@yahoo.com', [OUR]), ctx()),
    { kind: 'match', candidateId: CAND, applicationId: APP, via: 'thread', otherAddress: true })
})

Deno.test('unknown address with no ATS thread -> none', () => {
  assertEquals(classifyMessage(header('someone@yahoo.com'), ctx()), { kind: 'none' })
})

Deno.test('own mailbox -> self', () => {
  assertEquals(classifyMessage(header('hr@blynkex.com', [OUR]), ctx()), { kind: 'self' })
})
