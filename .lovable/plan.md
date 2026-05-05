# AI FAQ Doubt Solver — Implementation Plan

A staff-only AI assistant that answers internal questions about Blynkex ERP processes, grounded in your own curated FAQs and uploaded SOP documents using semantic (embeddings-based) retrieval. Supports **multi-language UI (English / Hindi / Hinglish)** and **multimodal input (text + image)**.

## What gets built

### 1. New sidebar module: "Help Assistant"
- Available to all logged-in staff via `PermissionGate` (new `help_assistant_view` permission)
- Admin sub-section gated by `help_assistant_manage` (Super Admin / Admin)

### 2. Staff chat interface (`/help-assistant`)
- ChatGPT-style UI: message list, input box, streaming token-by-token responses, markdown rendering
- **Language switcher** (top-right): English / हिन्दी / Hinglish — persists per user
  - UI strings translated via a lightweight i18n dictionary (no heavy i18next needed for 3 langs)
  - AI is instructed to reply in the user's chosen language; Hinglish = Roman-script Hindi mixed with English
- **Image + text input**:
  - Paperclip / camera button to attach an image (screenshot of an error, a Binance order, a document photo)
  - Drag-and-drop and paste-from-clipboard supported
  - Image previewed as thumbnail in input bar before sending
  - Multi-image support (up to 3 per message)
  - Mobile uses native camera capture (`<input type="file" accept="image/*" capture>`)
- Conversation history per user (sidebar list, "New chat" button)
- "Sources" section under each AI answer showing which FAQs/documents were used
- "Was this helpful?" 👍/👎 feedback per answer
- Respects existing dark/light theme

### 3. Admin KB Manager (`/help-assistant/admin`)
- **FAQs tab**: CRUD table of curated Q&A pairs with category, tags, status (draft/published). Each FAQ can be authored in English; AI handles translation at answer time.
- **Documents tab**: Upload SOPs (PDF/DOCX/TXT/MD), view list, delete, re-index
- **Analytics tab**: top questions, unanswered queries, low-rated answers, language breakdown

### 4. Backend (Lovable Cloud / Supabase)

**New tables:**
- `kb_faqs` — id, question, answer, category, tags[], status, created_by, embedding (vector)
- `kb_documents` — id, title, file_path, file_type, uploaded_by, status
- `kb_document_chunks` — id, document_id, chunk_text, chunk_index, embedding (vector)
- `staff_chat_conversations` — id, user_id, title, language, created_at, updated_at
- `staff_chat_messages` — id, conversation_id, role, content, image_urls[], sources (jsonb), feedback, created_at
- `staff_chat_user_prefs` — user_id, language ('en'|'hi'|'hinglish')

**Storage buckets** (private, RLS-gated):
- `kb-documents` — admin-uploaded SOPs
- `staff-chat-uploads` — user-uploaded images per message (auto-cleanup policy after 90 days)

**RLS:**
- Conversations/messages/uploads: users see only their own
- FAQs/documents: all authenticated read published; only `help_assistant_manage` can write (via `has_role`)

**pgvector** extension + HNSW index on embedding columns.

### 5. Edge functions

- `kb-embed` — generates embeddings via Lovable AI when FAQs/docs are added/updated
- `kb-ingest-document` — parses uploaded PDF/DOCX into ~500-token chunks with overlap, calls `kb-embed`
- `staff-chat` — streaming SSE endpoint:
  1. Accept `{ messages, conversationId, language, imageUrls[] }`
  2. If images present, embed query using **text portion only**; use `google/gemini-3-flash-preview` (vision-capable) for the answer call
  3. Retrieve top 5–8 relevant FAQ + doc chunks via cosine similarity RPC
  4. Build system prompt:
     - "You are an internal assistant for Blynkex ERP staff."
     - "Answer ONLY from the provided context. If context doesn't cover it, say so."
     - Language directive: `en` → English; `hi` → Devanagari Hindi; `hinglish` → Roman-script Hindi-English mix natural to Indian office staff
     - Vision directive when image attached: "Describe what you see in the image and connect it to the user's question."
  5. Stream response from Lovable AI; persist user + assistant messages with `image_urls` + `sources`
- `staff-chat-feedback` — records 👍/👎

### 6. Guardrails
- AI explicitly told to never fabricate ERP procedures — only answer from KB
- All KB writes audited (`created_by` = actual user UUID)
- Admin-only deletions use `AlertDialog`
- Rate limit: 30 messages/user/hour; max 3 images per message; max 5 MB per image (compressed client-side before upload)
- Token usage logged per message for cost visibility
- Errors 429 / 402 from Lovable AI surfaced as toasts in user's selected language

## Technical notes

- **AI provider**: Lovable AI Gateway, no API key needed. Default text model `google/gemini-3-flash-preview` (already vision-capable, so same model handles image inputs).
- **Embeddings**: Lovable AI gateway embedding model (768-dim), stored via `pgvector`.
- **i18n**: simple `t(key, lang)` helper with `en/hi/hinglish` dictionaries — no extra dependency.
- **Image upload flow**: client compresses to ≤1600px wide JPEG → uploads to `staff-chat-uploads` bucket → signed URL passed to `staff-chat` edge function → injected into Gemini multimodal payload as `image_url` parts.
- **Document parsing**: server-side in `kb-ingest-document` using Deno PDF/DOCX text extractor.
- **Permissions**: two new entries — `help_assistant_view`, `help_assistant_manage`.

## Out of scope (first version)
- Voice input/output
- Slack/Teams notification integration
- Auto-learning from chat (admin still curates KB)
- Languages beyond English / Hindi / Hinglish

## Build order
1. DB schema + pgvector + RLS + permissions + storage buckets
2. `kb-embed` + `kb-ingest-document` edge functions
3. Admin KB Manager UI (FAQs CRUD + document upload)
4. `staff-chat` streaming edge function with retrieval + vision + language directive
5. Staff chat UI: streaming, sources, feedback, language switcher, image upload
6. Sidebar entry + permission gates + analytics tab

Ready to build when you approve.