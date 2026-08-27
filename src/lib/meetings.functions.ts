import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

function randomSlug(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 3).join("")}-${chars.slice(3, 7).join("")}-${chars.slice(7, 10).join("")}`;
}

const titleSchema = z
  .string()
  .trim()
  .min(1, "Meeting title is required.")
  .max(120, "Meeting title is too long.");

/** Minimal, non-sensitive info for the invite screen (slug knowledge only). */
export const getMeetingPreview = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().trim().min(3).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meeting } = await supabaseAdmin
      .from("meetings")
      .select("title, status")
      .eq("public_slug", data.slug)
      .maybeSingle();

    if (!meeting) return { found: false as const };
    return { found: true as const, title: meeting.title, status: meeting.status };
  });

export const createMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string }) => z.object({ title: titleSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createVideoRoom } = await import("./videosdk.server");

    const roomId = await createVideoRoom();

    let slug = randomSlug();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await supabaseAdmin
        .from("meetings")
        .select("id")
        .eq("public_slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = randomSlug();
    }

    const { data: meeting, error } = await supabaseAdmin
      .from("meetings")
      .insert({
        host_id: context.userId,
        title: data.title,
        public_slug: slug,
        videosdk_meeting_id: roomId,
        status: "scheduled",
      })
      .select("id, public_slug, title")
      .single();

    if (error || !meeting) {
      console.error("[createMeeting]", error);
      throw new Error("Could not create the meeting. Please try again.");
    }

    await supabaseAdmin.from("meeting_participants").insert({
      meeting_id: meeting.id,
      user_id: context.userId,
      role: "host",
      status: "admitted",
      admitted_at: new Date().toISOString(),
    });

    await supabaseAdmin.from("meeting_events").insert({
      meeting_id: meeting.id,
      actor_user_id: context.userId,
      event_type: "meeting_created",
    });

    return { slug: meeting.public_slug, id: meeting.id, title: meeting.title };
  });

/**
 * Resolves a public slug into the caller's authorized meeting state,
 * creating a waiting-room record for first-time visitors.
 */
export const joinMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().trim().min(3).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: meeting } = await supabaseAdmin
      .from("meetings")
      .select("id, title, host_id, status, public_slug, started_at")
      .eq("public_slug", data.slug)
      .maybeSingle();

    if (!meeting) return { outcome: "not_found" as const };
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return { outcome: "ended" as const, title: meeting.title };
    }

    const { data: existing } = await supabaseAdmin
      .from("meeting_participants")
      .select("id, role, status")
      .eq("meeting_id", meeting.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const isHost = meeting.host_id === context.userId;
    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === "removed" || existing.status === "rejected") {
        return { outcome: "denied" as const, title: meeting.title };
      }
      if (existing.status === "left") {
        await supabaseAdmin
          .from("meeting_participants")
          .update({
            status: isHost || existing.role !== "participant" ? "admitted" : "waiting",
            left_at: null,
            joined_at: now,
          })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin
          .from("meeting_participants")
          .update({ joined_at: existing.status === "admitted" ? now : null })
          .eq("id", existing.id);
      }
    } else {
      await supabaseAdmin.from("meeting_participants").insert({
        meeting_id: meeting.id,
        user_id: context.userId,
        role: isHost ? "host" : "participant",
        status: isHost ? "admitted" : "waiting",
        admitted_at: isHost ? now : null,
        joined_at: isHost ? now : null,
      });
      await supabaseAdmin.from("meeting_events").insert({
        meeting_id: meeting.id,
        actor_user_id: context.userId,
        event_type: isHost ? "participant_joined" : "participant_requested",
      });
    }

    if (isHost && meeting.status === "scheduled") {
      await supabaseAdmin
        .from("meetings")
        .update({ status: "active", started_at: meeting.started_at ?? now })
        .eq("id", meeting.id);
      await supabaseAdmin.from("meeting_events").insert({
        meeting_id: meeting.id,
        actor_user_id: context.userId,
        event_type: "meeting_started",
      });
    }

    const { data: me } = await supabaseAdmin
      .from("meeting_participants")
      .select("id, role, status")
      .eq("meeting_id", meeting.id)
      .eq("user_id", context.userId)
      .single();

    return {
      outcome: "ok" as const,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        slug: meeting.public_slug,
        status: isHost && meeting.status === "scheduled" ? ("active" as const) : meeting.status,
        hostId: meeting.host_id,
      },
      participant: { id: me!.id, role: me!.role, status: me!.status },
    };
  });

/** Issues a short-lived VideoSDK credential — only for admitted participants. */
export const createVideoToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { meetingId: string }) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signVideoToken } = await import("./videosdk.server");

    const { data: meeting } = await supabaseAdmin
      .from("meetings")
      .select("id, status, videosdk_meeting_id")
      .eq("id", data.meetingId)
      .maybeSingle();

    if (!meeting || !meeting.videosdk_meeting_id) throw new Error("Meeting not found.");
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw new Error("This meeting has ended.");
    }

    const { data: participant } = await supabaseAdmin
      .from("meeting_participants")
      .select("status")
      .eq("meeting_id", meeting.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!participant || participant.status !== "admitted") {
      throw new Error("You are not admitted to this meeting yet.");
    }

    const token = await signVideoToken({
      kind: "participant",
      roomId: meeting.videosdk_meeting_id,
      participantId: context.userId,
    });

    return { token, roomId: meeting.videosdk_meeting_id };
  });

/** Host / co-host moderation: admit, reject or remove a participant. */
export const moderateParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { participantId: string; action: "admit" | "reject" | "remove" }) =>
    z
      .object({
        participantId: z.string().uuid(),
        action: z.enum(["admit", "reject", "remove"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("meeting_participants")
      .select("id, meeting_id, user_id, role")
      .eq("id", data.participantId)
      .maybeSingle();

    if (!target) throw new Error("Participant not found.");

    const { data: isModerator } = await context.supabase.rpc("is_meeting_moderator", {
      _meeting_id: target.meeting_id,
      _user_id: context.userId,
    });

    if (!isModerator) throw new Error("You don't have permission to manage this meeting.");
    if (target.role === "host") throw new Error("The host cannot be removed.");

    const now = new Date().toISOString();
    const patch =
      data.action === "admit"
        ? { status: "admitted" as const, admitted_at: now }
        : data.action === "reject"
          ? { status: "rejected" as const }
          : { status: "removed" as const, left_at: now };

    const { error } = await supabaseAdmin
      .from("meeting_participants")
      .update(patch)
      .eq("id", target.id);
    if (error) throw new Error("Could not update the participant.");

    await supabaseAdmin.from("meeting_events").insert({
      meeting_id: target.meeting_id,
      actor_user_id: context.userId,
      target_user_id: target.user_id,
      event_type:
        data.action === "admit"
          ? "participant_admitted"
          : data.action === "reject"
            ? "participant_rejected"
            : "participant_removed",
    });

    return { ok: true };
  });

/** A participant leaving on their own. */
export const leaveMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { meetingId: string }) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("meeting_participants")
      .update({ status: "left", left_at: now })
      .eq("meeting_id", data.meetingId)
      .eq("user_id", context.userId)
      .in("status", ["admitted", "waiting"]);

    await supabaseAdmin.from("meeting_events").insert({
      meeting_id: data.meetingId,
      actor_user_id: context.userId,
      event_type: "participant_left",
    });

    return { ok: true };
  });

export const endMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { meetingId: string }) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deactivateVideoRoom } = await import("./videosdk.server");

    const { data: meeting } = await supabaseAdmin
      .from("meetings")
      .select("id, host_id, videosdk_meeting_id")
      .eq("id", data.meetingId)
      .maybeSingle();

    if (!meeting) throw new Error("Meeting not found.");
    if (meeting.host_id !== context.userId) {
      throw new Error("Only the host can end this meeting.");
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("meetings")
      .update({ status: "ended", ended_at: now })
      .eq("id", meeting.id);

    await supabaseAdmin
      .from("meeting_participants")
      .update({ status: "left", left_at: now })
      .eq("meeting_id", meeting.id)
      .in("status", ["admitted", "waiting"]);

    await supabaseAdmin.from("meeting_events").insert({
      meeting_id: meeting.id,
      actor_user_id: context.userId,
      event_type: "meeting_ended",
    });

    if (meeting.videosdk_meeting_id) await deactivateVideoRoom(meeting.videosdk_meeting_id);

    return { ok: true };
  });
