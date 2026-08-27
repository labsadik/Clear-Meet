import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Meeting = Database["public"]["Tables"]["meetings"]["Row"];
export type MeetingParticipant = Database["public"]["Tables"]["meeting_participants"]["Row"];
export type MeetingMessage = Database["public"]["Tables"]["meeting_messages"]["Row"];

export type MeetingStatus = Database["public"]["Enums"]["meeting_status"];
export type ParticipantRole = Database["public"]["Enums"]["participant_role"];
export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type ParticipantWithProfile = MeetingParticipant & {
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
};

export type MessageWithProfile = MeetingMessage & {
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
};
