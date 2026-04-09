
CREATE TABLE public.client_kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kyc documents"
  ON public.client_kyc_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert kyc documents"
  ON public.client_kyc_documents FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update kyc documents"
  ON public.client_kyc_documents FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete kyc documents"
  ON public.client_kyc_documents FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_client_kyc_documents_client_id ON public.client_kyc_documents(client_id);
CREATE INDEX idx_client_kyc_documents_type ON public.client_kyc_documents(document_type);
