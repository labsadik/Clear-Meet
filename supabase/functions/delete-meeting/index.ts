import { corsHeaders, json, requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { supabase, user } = await requireUser(req);
    const { meetingId } = await req.json();

    if (!meetingId || typeof meetingId !== "string") {
      return json({ error: "Meeting ID is required." }, 400);
    }

    const { data: meeting, error: lookupError } = await supabase
      .from("meetings")
      .select("id,host_id,title")
      .eq("id", meetingId)
      .single();

    if (lookupError || !meeting) {
      return json({ error: "Meeting not found." }, 404);
    }

    if (meeting.host_id !== user.id) {
      return json({ error: "Only the meeting creator can delete this meeting." }, 403);
    }

    const { error: deleteError } = await supabase
      .from("meetings")
      .delete()
      .eq("id", meetingId)
      .eq("host_id", user.id);

    if (deleteError) throw deleteError;

    return json({ deleted: true, meetingId });
  } catch (error) {
    console.error("delete-meeting", error);
    return json(
      { error: error instanceof Error ? error.message : "Unable to delete meeting." },
      400,
    );
  }
});
