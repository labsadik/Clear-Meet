-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'active', 'ended', 'cancelled');
CREATE TYPE public.participant_role AS ENUM ('host', 'co_host', 'participant');
CREATE TYPE public.participant_status AS ENUM ('waiting', 'admitted', 'rejected', 'left', 'removed');

-- Shared updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'User',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''), split_part(NEW.email, '@', 1), 'User'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Meetings
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(TRIM(title)) BETWEEN 1 AND 120),
  public_slug TEXT UNIQUE NOT NULL CHECK (char_length(public_slug) BETWEEN 6 AND 64),
  videosdk_meeting_id TEXT,
  status public.meeting_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_host_id ON public.meetings(host_id);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meetings_created_at ON public.meetings(created_at DESC);
GRANT SELECT ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER meetings_set_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Participants
CREATE TABLE public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.participant_role NOT NULL DEFAULT 'participant',
  status public.participant_status NOT NULL DEFAULT 'waiting',
  joined_at TIMESTAMPTZ,
  admitted_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);
CREATE INDEX idx_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX idx_participants_user_id ON public.meeting_participants(user_id);
CREATE INDEX idx_participants_status ON public.meeting_participants(status);
GRANT SELECT ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER participants_set_updated_at BEFORE UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants p
    WHERE p.meeting_id = _meeting_id AND p.user_id = _user_id
      AND p.status <> 'rejected'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_admitted(_meeting_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants p
    WHERE p.meeting_id = _meeting_id AND p.user_id = _user_id
      AND p.status = 'admitted'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_moderator(_meeting_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants p
    WHERE p.meeting_id = _meeting_id AND p.user_id = _user_id
      AND p.role IN ('host', 'co_host') AND p.status = 'admitted'
  ) OR EXISTS (
    SELECT 1 FROM public.meetings m WHERE m.id = _meeting_id AND m.host_id = _user_id
  );
$$;

-- Meeting policies
CREATE POLICY "meetings_select_members" ON public.meetings FOR SELECT TO authenticated
USING (host_id = auth.uid() OR public.is_meeting_member(id, auth.uid()));

-- Participant policies
CREATE POLICY "participants_select_members" ON public.meeting_participants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_meeting_member(meeting_id, auth.uid()));

-- Messages
CREATE TABLE public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(TRIM(message)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_meeting_id ON public.meeting_messages(meeting_id, created_at);
GRANT SELECT, INSERT ON public.meeting_messages TO authenticated;
GRANT ALL ON public.meeting_messages TO service_role;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON public.meeting_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "messages_select_admitted" ON public.meeting_messages FOR SELECT TO authenticated
USING (public.is_meeting_admitted(meeting_id, auth.uid()));
CREATE POLICY "messages_insert_admitted_self" ON public.meeting_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.is_meeting_admitted(meeting_id, auth.uid()));

-- Events
CREATE TABLE public.meeting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_meeting_id ON public.meeting_events(meeting_id, created_at DESC);
GRANT SELECT ON public.meeting_events TO authenticated;
GRANT ALL ON public.meeting_events TO service_role;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select_members" ON public.meeting_events FOR SELECT TO authenticated
USING (public.is_meeting_member(meeting_id, auth.uid()));

-- Realtime
ALTER TABLE public.meeting_participants REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_messages REPLICA IDENTITY FULL;
ALTER TABLE public.meetings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;

-- Storage policies for avatars bucket
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);