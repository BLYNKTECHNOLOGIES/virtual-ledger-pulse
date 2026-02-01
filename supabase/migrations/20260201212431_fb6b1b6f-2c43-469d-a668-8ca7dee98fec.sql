-- Create purchase_action_timings table for storing workflow action timestamps
CREATE TABLE public.purchase_action_timings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  action_type text NOT NULL,
  actor_role text NOT NULL DEFAULT 'system',
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  actor_user_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure we don't duplicate the same action for the same order
  CONSTRAINT unique_order_action UNIQUE (order_id, action_type)
);

-- Add foreign key to purchase_orders
ALTER TABLE public.purchase_action_timings
ADD CONSTRAINT purchase_action_timings_order_id_fkey
FOREIGN KEY (order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

-- Add foreign key to users for actor tracking
ALTER TABLE public.purchase_action_timings
ADD CONSTRAINT purchase_action_timings_actor_user_id_fkey
FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.purchase_action_timings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (matches existing pattern)
CREATE POLICY "Allow all operations on purchase_action_timings"
ON public.purchase_action_timings
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for efficient querying by order
CREATE INDEX idx_purchase_action_timings_order_id ON public.purchase_action_timings(order_id);

-- Create index for action type queries
CREATE INDEX idx_purchase_action_timings_action_type ON public.purchase_action_timings(action_type);

-- Add comment for documentation
COMMENT ON TABLE public.purchase_action_timings IS 'Stores precise timestamps for purchase workflow actions for turnaround analysis';
COMMENT ON COLUMN public.purchase_action_timings.action_type IS 'Type of action: order_created, order_cancelled, order_expired, order_completed, banking_collected, pan_collected, added_to_bank, payment_created, payment_completed, manual_entry_created';
COMMENT ON COLUMN public.purchase_action_timings.actor_role IS 'Role performing the action: purchase_creator, payer, system';