import { corsHeaders, json, requireUser } from "../_shared/auth.ts";
import { createParticipantToken } from "../_shared/videosdk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await requireUser(req);
    const { meetingId } = await req.json();
    if (typeof meetingId !== "string") return json({ error:"Meeting ID is required." },400);
    const { data: meeting, error: meetingError } = await supabase.from("meetings").select("id,status,videosdk_meeting_id,host_id").eq("id",meetingId).single();
    if (meetingError || !meeting) return json({ error:"Meeting not found." },404);
    const { data: participant } = await supabase.from("meeting_participants").select("role,status").eq("meeting_id",meetingId).eq("user_id",user.id).single();
    if (!participant || participant.status !== "admitted") return json({ error:"You are not admitted to this meeting." },403);
    const moderator = participant.role === "host" || participant.role === "co_host" || meeting.host_id === user.id;
    const token = await createParticipantToken(moderator ? ["allow_join","allow_mod"] : ["allow_join"]);
    await supabase.from("meeting_participants").update({ joined_at:new Date().toISOString(), status:"admitted" }).eq("meeting_id",meetingId).eq("user_id",user.id);
    if (meeting.status === "scheduled") await supabase.from("meetings").update({ status:"active", started_at:new Date().toISOString() }).eq("id",meetingId);
    await supabase.from("meeting_events").insert({ meeting_id:meetingId,actor_user_id:user.id,event_type:"participant_joined" });
    return json({ token, meetingId:meeting.videosdk_meeting_id });
  } catch (error) { console.error(error); return json({ error:error instanceof Error?error.message:"Unable to create video token" },400); }
});
