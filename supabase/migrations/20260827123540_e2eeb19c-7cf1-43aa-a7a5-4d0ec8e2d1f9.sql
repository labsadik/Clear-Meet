REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_meeting_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_meeting_admitted(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_meeting_moderator(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_admitted(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_moderator(UUID, UUID) TO authenticated;