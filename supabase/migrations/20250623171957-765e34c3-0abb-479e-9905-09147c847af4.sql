
-- Create screen_share_requests table for handling remote monitoring requests
CREATE TABLE IF NOT EXISTS screen_share_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    admin_username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'ended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_screen_share_requests_admin_id ON screen_share_requests(admin_id);
CREATE INDEX IF NOT EXISTS idx_screen_share_requests_target_user_id ON screen_share_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_screen_share_requests_status ON screen_share_requests(status);

-- Enable RLS
ALTER TABLE screen_share_requests ENABLE ROW LEVEL SECURITY;

-- Policies for screen share requests
CREATE POLICY "Users can view requests they are involved in" ON screen_share_requests
    FOR SELECT USING (
        auth.uid() = admin_id OR 
        auth.uid() = target_user_id
    );

CREATE POLICY "Admins can create screen share requests" ON screen_share_requests
    FOR INSERT WITH CHECK (auth.uid() = admin_id);

CREATE POLICY "Users can update requests they are involved in" ON screen_share_requests
    FOR UPDATE USING (
        auth.uid() = admin_id OR 
        auth.uid() = target_user_id
    );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE screen_share_requests;

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_screen_share_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_screen_share_requests_updated_at
    BEFORE UPDATE ON screen_share_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_screen_share_requests_updated_at();
