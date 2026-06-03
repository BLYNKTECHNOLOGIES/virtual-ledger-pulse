ALTER TABLE public.small_sales_config
ADD COLUMN IF NOT EXISTS auto_mark_chat_read boolean NOT NULL DEFAULT false;