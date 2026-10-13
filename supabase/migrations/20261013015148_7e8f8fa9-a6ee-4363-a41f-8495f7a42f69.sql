REVOKE EXECUTE ON FUNCTION public.ats_set_conversation(uuid, text, timestamptz), public.ats_set_message_intent(uuid, text),
  public.ats_mark_message_handled(uuid, text), public.ats_set_interview_response(uuid, text, uuid),
  public.ats_log_contact(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ats_messages_reopen_conversation() FROM PUBLIC, anon, authenticated;