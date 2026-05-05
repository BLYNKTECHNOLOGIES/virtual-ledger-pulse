
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.kb_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  embedding vector(768),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kb_faqs_embedding_idx ON public.kb_faqs USING hnsw (embedding vector_cosine_ops);
CREATE INDEX kb_faqs_status_idx ON public.kb_faqs(status);

CREATE TABLE public.kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed','archived')),
  error_message TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kb_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.kb_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kb_chunks_embedding_idx ON public.kb_document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX kb_chunks_doc_idx ON public.kb_document_chunks(document_id);

CREATE TABLE public.staff_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','hinglish')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_chat_conv_user_idx ON public.staff_chat_conversations(user_id, updated_at DESC);

CREATE TABLE public.staff_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.staff_chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  image_urls TEXT[] DEFAULT '{}',
  sources JSONB DEFAULT '[]',
  feedback SMALLINT CHECK (feedback IN (-1,0,1)),
  token_usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_chat_msg_conv_idx ON public.staff_chat_messages(conversation_id, created_at);

CREATE TABLE public.staff_chat_user_prefs (
  user_id UUID PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','hinglish')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_chat_rate_limit (
  user_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);

CREATE TRIGGER trg_kb_faqs_updated BEFORE UPDATE ON public.kb_faqs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kb_documents_updated BEFORE UPDATE ON public.kb_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_staff_chat_conv_updated BEFORE UPDATE ON public.staff_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_help_assistant_permission(_user_id uuid, _perm app_permission)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id AND rp.permission = _perm
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND lower(r.name) IN ('super admin','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.match_kb(
  query_embedding vector(768),
  match_count INTEGER DEFAULT 6,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  source_type TEXT,
  source_id UUID,
  parent_id UUID,
  title TEXT,
  content TEXT,
  similarity FLOAT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH faq_matches AS (
    SELECT 'faq'::text AS source_type, f.id, f.id AS parent_id,
           f.question AS title, f.answer AS content,
           1 - (f.embedding <=> query_embedding) AS similarity
    FROM public.kb_faqs f
    WHERE f.status='published' AND f.embedding IS NOT NULL
  ),
  doc_matches AS (
    SELECT 'doc'::text AS source_type, c.id, d.id AS parent_id,
           d.title AS title, c.chunk_text AS content,
           1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.kb_document_chunks c
    JOIN public.kb_documents d ON d.id = c.document_id
    WHERE d.status='ready' AND c.embedding IS NOT NULL
  )
  SELECT * FROM (SELECT * FROM faq_matches UNION ALL SELECT * FROM doc_matches) m
  WHERE similarity >= similarity_threshold
  ORDER BY similarity DESC LIMIT match_count;
$$;

ALTER TABLE public.kb_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_user_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_chat_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FAQs read published" ON public.kb_faqs FOR SELECT TO authenticated
  USING (status='published' OR public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));
CREATE POLICY "FAQs manage" ON public.kb_faqs FOR ALL TO authenticated
  USING (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'))
  WITH CHECK (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));

CREATE POLICY "Docs read ready" ON public.kb_documents FOR SELECT TO authenticated
  USING (status IN ('ready','processing') OR public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));
CREATE POLICY "Docs manage" ON public.kb_documents FOR ALL TO authenticated
  USING (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'))
  WITH CHECK (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));

CREATE POLICY "Chunks read" ON public.kb_document_chunks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Chunks manage" ON public.kb_document_chunks FOR ALL TO authenticated
  USING (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'))
  WITH CHECK (public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));

CREATE POLICY "Own conversations" ON public.staff_chat_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own messages read" ON public.staff_chat_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));
CREATE POLICY "Own messages write" ON public.staff_chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own messages update" ON public.staff_chat_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own prefs" ON public.staff_chat_user_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own rate limit" ON public.staff_chat_rate_limit FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO storage.buckets (id, name, public) VALUES ('kb-documents','kb-documents', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-chat-uploads','staff-chat-uploads', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "kb-docs read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kb-documents');
CREATE POLICY "kb-docs upload manager" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='kb-documents' AND public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));
CREATE POLICY "kb-docs delete manager" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='kb-documents' AND public.has_help_assistant_permission(auth.uid(),'help_assistant_manage'));

CREATE POLICY "chat-uploads read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='staff-chat-uploads' AND (auth.uid()::text = (storage.foldername(name))[1]));
CREATE POLICY "chat-uploads insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='staff-chat-uploads' AND (auth.uid()::text = (storage.foldername(name))[1]));
CREATE POLICY "chat-uploads delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='staff-chat-uploads' AND (auth.uid()::text = (storage.foldername(name))[1]));
