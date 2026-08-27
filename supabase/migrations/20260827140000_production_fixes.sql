-- Production repair: create the avatar bucket and make it safe to apply repeatedly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Ensure the application role can read the profile relation used by participant joins.
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.meetings, public.meeting_participants, public.meeting_messages, public.meeting_events TO authenticated;
