REVOKE ALL ON FUNCTION public.mark_terminal_binance_chat_read(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_terminal_binance_chats_read(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_terminal_binance_chat_read(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_terminal_binance_chats_read(text[], text) TO authenticated, service_role;