import { corsHeaders, json, requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await requireUser(req);
    const { slug } = await req.json();
    if (typeof slug !== "string" || !/^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/.test(slug)) return json({ error:"Invalid meeting code." },400);
    const { data: meeting, error: meetingError } = await supabase.from("meetings").select("id,host_id,title,public_slug,videosdk_meeting_id,status,created_at").eq("public_slug",slug).maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting) return json({ error:"Meeting not found." },404);
    if (meeting.status === "ended" || meeting.status === "cancelled") return json({ error:"This meeting has ended." },410);
    const { data: existing } = await supabase.from("meeting_participants").select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").eq("meeting_id",meeting.id).eq("user_id",user.id).maybeSingle();
    if (existing) {
      if (existing.status === "left") {
        const { data: updated, error } = await supabase.from("meeting_participants").update({ status: meeting.host_id===user.id?"admitted":"waiting", left_at:null }).eq("id",existing.id).select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").single();
        if (error) throw error;
        return json({ meeting, participant:updated });
      }
      return json({ meeting, participant:existing });
    }
    const isHost = meeting.host_id === user.id;
    const { data: participant, error } = await supabase.from("meeting_participants").insert({ meeting_id:meeting.id,user_id:user.id,role:isHost?"host":"participant",status:isHost?"admitted":"waiting",admitted_at:isHost?new Date().toISOString():null }).select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").single();
    if (error) throw error;
    await supabase.from("meeting_events").insert({ meeting_id:meeting.id,actor_user_id:user.id,target_user_id:user.id,event_type:isHost?"participant_admitted":"participant_requested" });
    return json({ meeting, participant });
  } catch (error) { console.error(error); return json({ error:error instanceof Error?error.message:"Unable to join meeting" },400); }
});
