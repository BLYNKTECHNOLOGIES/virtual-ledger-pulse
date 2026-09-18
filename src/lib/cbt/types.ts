// Shapes returned by the candidate edge functions (already sanitised server-side).
export type CbtSettings = {
  brand_name?: string;
  company_name?: string;
  logo_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  hr_email?: string | null;
  retention_days?: number | null;
  max_warnings?: number | null;
  on_warning_limit?: string | null;
  deadline_grace_seconds?: number | null;
  [key: string]: unknown;
};

export type CbtSectionSummary = {
  id: string;
  order_index: number;
  section_code: string;
  section_type: 'typing' | 'data_entry' | 'match_pairs' | 'objective' | 'written' | 'mental_maths' | 'memory_recall';
  title?: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'auto_submitted';
  entered_at?: string | null;
  started_at?: string | null;
  deadline_at?: string | null;
  item_count?: number | null;
  duration_seconds?: number | null;
  practice_seconds?: number;
  min_words?: number | null;
  max_words?: number | null;
  negative_mark?: number;
  instructions?: string | null;
  score?: number | null;
};

export type CbtItem = {
  id: string;
  display_order: number;
  type: 'mcq' | 'numeric' | 'sjt' | 'written' | 'typing_passage' | 'data_entry_record' | 'match_pair' | 'mental_maths' | 'memory_recall';
  category_tag?: string | null;
  content: Record<string, any>;
  response: Record<string, any> | null;
  visited: boolean;
  marked_for_review: boolean;
};

export type CbtCurrentSection = CbtSectionSummary & {
  items: CbtItem[];
  stimulus?: { title?: string; body?: string } | null;
};

export type CbtState = {
  ok: true;
  server_now?: string;
  settings: CbtSettings & {
    heartbeat_seconds?: number | null;
    transition_seconds?: number | null;
    typing_practice_passage?: string | null;
  };
  attempt: {
    public_ref?: string;
    status: 'registered' | 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned' | 'invalidated';
    warning_count?: number;
    current_section_index?: number | null;
    candidate_name?: string;
    drive_name?: string;
    drive_mode?: string;
    show_score_to_candidate?: boolean;
    role_name?: string;
    role_code?: string;
    total_sections?: number;
    [key: string]: unknown;
  };
  sections: CbtSectionSummary[];
  blueprint?: CbtSectionSummary[];
  current_section: CbtCurrentSection | null;
};
