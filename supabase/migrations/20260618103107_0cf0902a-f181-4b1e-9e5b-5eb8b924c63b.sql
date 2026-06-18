CREATE TABLE public.erp_password_otps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.erp_password_otps TO service_role;

ALTER TABLE public.erp_password_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_erp_password_otps_email ON public.erp_password_otps (lower(email));
