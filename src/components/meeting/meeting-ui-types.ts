export type ParticipantRow = {
  id: string;
  meeting_id: string;
  user_id: string;
  role: "host" | "co_host" | "participant";
  status:
    | "waiting"
    | "admitted"
    | "rejected"
    | "left"
    | "removed";
  joined_at: string | null;
  profiles?: {
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  profiles?: {
    display_name: string;
  } | null;
};
