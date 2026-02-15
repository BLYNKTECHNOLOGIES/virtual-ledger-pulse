
-- Candidate notes/remarks table (Horilla feature)
CREATE TABLE public.hr_candidate_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.hr_candidates(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_candidate_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hr_candidate_notes" ON public.hr_candidate_notes FOR ALL USING (true) WITH CHECK (true);

-- Add manager_id to stages
ALTER TABLE public.hr_stages ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.hr_employees(id);

-- Add reject_reason to candidates
ALTER TABLE public.hr_candidates ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- Create index
CREATE INDEX idx_hr_candidate_notes_candidate_id ON public.hr_candidate_notes(candidate_id);
