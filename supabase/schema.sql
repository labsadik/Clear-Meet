CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.meeting_status AS ENUM ('scheduled','active','ended','cancelled');
CREATE TYPE public.participant_role AS ENUM ('host','co_host','participant');
CREATE TYPE public.participant_status AS ENUM ('waiting','admitted','rejected','left','removed');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT 'User', avatar_url text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles(id,display_name,avatar_url) VALUES(NEW.id,COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'),''),split_part(NEW.email,'@',1),'User'),NEW.raw_user_meta_data->>'avatar_url') ON CONFLICT(id) DO NOTHING; RETURN NEW; END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(TRIM(title)) BETWEEN 1 AND 120), public_slug text UNIQUE NOT NULL CHECK(char_length(public_slug) BETWEEN 6 AND 64),
 videosdk_meeting_id text, status public.meeting_status NOT NULL DEFAULT 'scheduled',
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, ended_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_host_idx ON public.meetings(host_id); CREATE INDEX meetings_status_idx ON public.meetings(status); CREATE INDEX meetings_created_idx ON public.meetings(created_at DESC);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, role public.participant_role NOT NULL DEFAULT 'participant', status public.participant_status NOT NULL DEFAULT 'waiting',
 joined_at timestamptz, admitted_at timestamptz, left_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(meeting_id,user_id)
);
CREATE INDEX participants_meeting_idx ON public.meeting_participants(meeting_id); CREATE INDEX participants_user_idx ON public.meeting_participants(user_id); CREATE INDEX participants_status_idx ON public.meeting_participants(status);
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_meeting_member(_meeting_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.meeting_participants WHERE meeting_id=_meeting_id AND user_id=_user_id AND status<>'rejected'); $$;
CREATE OR REPLACE FUNCTION public.is_meeting_admitted(_meeting_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.meeting_participants WHERE meeting_id=_meeting_id AND user_id=_user_id AND status='admitted'); $$;
CREATE OR REPLACE FUNCTION public.is_meeting_moderator(_meeting_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.meeting_participants WHERE meeting_id=_meeting_id AND user_id=_user_id AND role IN('host','co_host') AND status='admitted') OR EXISTS(SELECT 1 FROM public.meetings WHERE id=_meeting_id AND host_id=_user_id); $$;

CREATE POLICY meetings_select_members ON public.meetings FOR SELECT TO authenticated USING(host_id=auth.uid() OR public.is_meeting_member(id,auth.uid()));
CREATE POLICY participants_select_members ON public.meeting_participants FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_meeting_member(meeting_id,auth.uid()));
CREATE TRIGGER meetings_updated BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER participants_updated BEFORE UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meeting_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, message text NOT NULL CHECK(char_length(TRIM(message)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_meeting_idx ON public.meeting_messages(meeting_id,created_at); ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_select_admitted ON public.meeting_messages FOR SELECT TO authenticated USING(public.is_meeting_admitted(meeting_id,auth.uid()));
CREATE POLICY messages_insert_self ON public.meeting_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND public.is_meeting_admitted(meeting_id,auth.uid()));
CREATE TRIGGER messages_updated BEFORE UPDATE ON public.meeting_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meeting_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
 actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, event_type text NOT NULL, target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_meeting_idx ON public.meeting_events(meeting_id,created_at DESC); ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_select_members ON public.meeting_events FOR SELECT TO authenticated USING(public.is_meeting_member(meeting_id,auth.uid()));

GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated; GRANT SELECT ON public.meetings,public.meeting_participants,public.meeting_messages,public.meeting_events TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_admitted(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_moderator(uuid,uuid) TO authenticated;

INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',true) ON CONFLICT(id) DO UPDATE SET public=true;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING(bucket_id='avatars');
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK(bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated USING(bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text);

ALTER TABLE public.meetings REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_participants REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
