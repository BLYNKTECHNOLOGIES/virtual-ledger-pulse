GRANT USAGE ON SCHEMA net TO supabase_read_only_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO supabase_read_only_user;
GRANT SELECT, INSERT ON net.http_request_queue TO supabase_read_only_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA net TO supabase_read_only_user;