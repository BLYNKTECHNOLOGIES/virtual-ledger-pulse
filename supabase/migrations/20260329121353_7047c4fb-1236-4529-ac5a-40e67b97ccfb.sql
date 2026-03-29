
CREATE TABLE IF NOT EXISTS hr_email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hr_email_send_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_hr_email_send_log_message_id ON hr_email_send_log(message_id);
CREATE INDEX idx_hr_email_send_log_created_at ON hr_email_send_log(created_at DESC);
