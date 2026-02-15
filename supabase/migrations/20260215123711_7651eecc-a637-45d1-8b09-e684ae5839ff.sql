
-- HR Assets table
CREATE TABLE public.hr_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'hardware',
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  assigned_to UUID REFERENCES public.hr_employees(id),
  assigned_date DATE,
  return_date DATE,
  purchase_date DATE,
  purchase_cost NUMERIC DEFAULT 0,
  condition TEXT DEFAULT 'good',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_assets" ON public.hr_assets FOR ALL USING (true) WITH CHECK (true);

-- HR Helpdesk tickets
CREATE TABLE public.hr_helpdesk_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  raised_by UUID REFERENCES public.hr_employees(id),
  assigned_to UUID REFERENCES public.hr_employees(id),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_helpdesk_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_helpdesk_tickets" ON public.hr_helpdesk_tickets FOR ALL USING (true) WITH CHECK (true);

-- HR Announcements
CREATE TABLE public.hr_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'general',
  is_pinned BOOLEAN DEFAULT false,
  published BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_announcements" ON public.hr_announcements FOR ALL USING (true) WITH CHECK (true);
