import { corsHeaders, json, requireUser, randomSlug } from "../_shared/auth.ts";
import { createRoom } from "../_shared/videosdk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) return json({ error: "Meeting title must be 1–120 characters." }, 400);
    const roomId = await createRoom();
    let slug = randomSlug();
    for (let i=0;i<5;i++) {
      const { data: existing } = await supabase.from("meetings").select("id").eq("public_slug", slug).maybeSingle();
      if (!existing) break;
      slug = randomSlug();
    }
    const { data: meeting, error } = await supabase.from("meetings").insert({ host_id:user.id, title, public_slug:slug, videosdk_meeting_id:roomId, status:"scheduled" }).select("id,host_id,title,public_slug,videosdk_meeting_id,status,created_at").single();
    if (error) throw error;
    const { error: participantError } = await supabase.from("meeting_participants").insert({ meeting_id:meeting.id, user_id:user.id, role:"host", status:"admitted", admitted_at:new Date().toISOString() });
    if (participantError) throw participantError;
    await supabase.from("meeting_events").insert({ meeting_id:meeting.id, actor_user_id:user.id, event_type:"meeting_created" });
    return json({ meeting });
  } catch (error) { console.error(error); return json({ error:error instanceof Error?error.message:"Unable to create meeting" }, 400); }
});
