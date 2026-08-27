import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, CameraOff, LogOut, Mic, MicOff, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { invoke, type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

type ParticipantRow = {
  id: string;
  meeting_id: string;
  user_id: string;
  role: "host" | "co_host" | "participant";
  status: "waiting" | "admitted" | "rejected" | "left" | "removed";
  joined_at: string | null;
  profiles?: {
    display_name: string;
    avatar_url: string | null;
  } | null;
};

type VideoMeetingClientProps = {
  token: string;
  meeting: Meeting;
  participant: ParticipantRow;
  displayName: string;
  initialMicEnabled: boolean;
  initialWebcamEnabled: boolean;
  onLeave: () => Promise<void>;
};

export const Route = createFileRoute("/meeting/$meetingSlug")({
  component: MeetingRoute,
});

function MeetingRoute() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { meetingSlug } = Route.useParams();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participant, setParticipant] = useState<ParticipantRow | null>(null);
  const [error, setError] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [wantsToJoin, setWantsToJoin] = useState(false);
  const [preJoinMic, setPreJoinMic] = useState(false);
  const [preJoinCamera, setPreJoinCamera] = useState(false);
  const [token, setToken] = useState("");
  const [VideoMeetingClient, setVideoMeetingClient] = useState<
    React.ComponentType<VideoMeetingClientProps> | null
  >(null);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      sessionStorage.setItem("clear-meet-return", window.location.pathname);
      void navigate({ to: "/login" });
      return;
    }

    let cancelled = false;

    void invoke<{
      meeting: Meeting;
      participant: ParticipantRow;
    }>("join-meeting", { slug: meetingSlug })
      .then((result) => {
        if (cancelled) return;
        setMeeting(result.meeting);
        setParticipant(result.participant);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not open meeting",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRoom(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, meetingSlug, navigate]);

  useEffect(() => {
    if (!user || !participant) return;

    const channel = supabase
      .channel(`participant-${participant.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "meeting_participants",
          filter: `id=eq.${participant.id}`,
        },
        (payload) => setParticipant(payload.new as ParticipantRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, participant?.id]);

  useEffect(() => {
    const meetingId = meeting?.id;
    const participantId = participant?.id;
    const status = participant?.status;
    const videoMeetingId = meeting?.videosdk_meeting_id;

    if (!meetingId || !participantId || !wantsToJoin) return;

    if (status === "rejected" || status === "removed") {
      setToken("");
      setVideoMeetingClient(null);
      setWantsToJoin(false);
      sessionKeyRef.current = null;
      return;
    }

    if (status !== "admitted") return;

    if (!videoMeetingId) {
      setError(
        "This meeting has no VideoSDK meeting ID. Please create a new meeting.",
      );
      return;
    }

    const sessionKey = `${meetingId}:${participantId}:${videoMeetingId}`;
    if (sessionKeyRef.current === sessionKey) return;

    sessionKeyRef.current = sessionKey;
    let cancelled = false;

    setError("");

    void invoke<{ token: string; meetingId: string }>("create-video-token", {
      meetingId,
    })
      .then((result) => {
        if (cancelled) return;

        if (!result.token || result.meetingId !== videoMeetingId) {
          throw new Error(
            "Video service returned an invalid meeting token or meeting ID.",
          );
        }

        setToken(result.token);
      })
      .catch((err) => {
        if (cancelled) return;
        sessionKeyRef.current = null;
        setToken("");
        setVideoMeetingClient(null);
        setError(
          err instanceof Error ? err.message : "Could not authorize video",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    meeting?.id,
    meeting?.videosdk_meeting_id,
    participant?.id,
    participant?.status,
    wantsToJoin,
  ]);

  useEffect(() => {
    if (!token || typeof window === "undefined" || VideoMeetingClient) return;

    let cancelled = false;

    void import("@/components/meeting/video-meeting-client")
      .then((module) => {
        if (!cancelled) {
          setVideoMeetingClient(() => module.VideoMeetingClient);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load video service",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, VideoMeetingClient]);

  if (loading || loadingRoom) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <div className="eyebrow">CLEAR MEET</div>
          <h1>Opening meeting…</h1>
          <p className="muted">Checking your meeting access.</p>
        </div>
      </div>
    );
  }

  if (error && !meeting) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <div className="error">{error}</div>
          <Link
            className="button secondary"
            style={{ marginTop: 14 }}
            to="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!meeting || !participant) return null;

  if (participant.status === "waiting") {
    return <WaitingRoom meeting={meeting} />;
  }

  if (participant.status === "rejected" || participant.status === "removed") {
    return (
      <div className="center-page">
        <div className="card narrow">
          <div className="eyebrow">ACCESS ENDED</div>
          <h1>You can’t enter this meeting</h1>
          <p className="muted">
            The host has {participant.status === "removed" ? "removed you" : "declined your request"}.
          </p>
          <Link className="button primary" to="/dashboard">
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!wantsToJoin) {
    return (
      <PreJoin
        meeting={meeting}
        displayName={profile?.display_name || user?.email || "Guest"}
        micEnabled={preJoinMic}
        cameraEnabled={preJoinCamera}
        onMicChange={setPreJoinMic}
        onCameraChange={setPreJoinCamera}
        onJoin={() => {
          setError("");
          setWantsToJoin(true);
        }}
        onLeave={async () => {
          await navigate({ to: "/dashboard" });
        }}
      />
    );
  }

  if (!token || !VideoMeetingClient) {
    return (
      <div className="center-page">
        <div className="card narrow">
          <div className="eyebrow">{error ? "VIDEO ERROR" : "CONNECTING"}</div>
          <h1>{error ? "Could not start meeting" : "Connecting to meeting…"}</h1>
          <p className="muted">
            {error ||
              "Joining the video room. Your selected devices will be enabled only after the room is joined."}
          </p>
          <div className="actions" style={{ marginTop: 14 }}>
            {error && (
              <button
                className="button primary"
                onClick={() => {
                  sessionKeyRef.current = null;
                  setToken("");
                  setVideoMeetingClient(null);
                  setError("");
                  setWantsToJoin(false);
                }}
              >
                Back to preview
              </button>
            )}
            <button
              className="button secondary"
              onClick={() => void navigate({ to: "/dashboard" })}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VideoMeetingClient
      token={token}
      meeting={meeting}
      participant={participant}
      displayName={profile?.display_name || user?.email || "Guest"}
      initialMicEnabled={preJoinMic}
      initialWebcamEnabled={preJoinCamera}
      onLeave={async () => {
        try {
          await invoke("leave-meeting", { meetingId: meeting.id });
        } finally {
          await navigate({ to: "/dashboard" });
        }
      }}
    />
  );
}

function PreJoin({
  meeting,
  displayName,
  micEnabled,
  cameraEnabled,
  onMicChange,
  onCameraChange,
  onJoin,
  onLeave,
}: {
  meeting: Meeting;
  displayName: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onMicChange: (enabled: boolean) => void;
  onCameraChange: (enabled: boolean) => void;
  onJoin: () => void;
  onLeave: () => Promise<void>;
}) {
  return (
    <div className="center-page">
      <div className="card narrow">
        <div className="eyebrow">READY TO JOIN</div>
        <h1>{meeting.title}</h1>
        <p className="muted">
          Joining as <strong>{displayName}</strong>. You do not need a microphone
          or camera to enter. You can enable either one after joining.
        </p>

        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          <button
            className="button secondary"
            type="button"
            aria-pressed={micEnabled}
            onClick={() => onMicChange(!micEnabled)}
          >
            {micEnabled ? <Mic size={17} /> : <MicOff size={17} />}
            {micEnabled ? "Start with microphone on" : "Join with microphone off"}
          </button>

          <button
            className="button secondary"
            type="button"
            aria-pressed={cameraEnabled}
            onClick={() => onCameraChange(!cameraEnabled)}
          >
            {cameraEnabled ? <Camera size={17} /> : <CameraOff size={17} />}
            {cameraEnabled ? "Start with camera on" : "Join with camera off"}
          </button>
        </div>

        <div className="actions" style={{ marginTop: 18 }}>
          <button className="button primary" onClick={onJoin}>
            <Video size={17} />
            Join meeting
          </button>
          <button className="button secondary" onClick={() => void onLeave()}>
            <LogOut size={16} />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ meeting }: { meeting: Meeting }) {
  return (
    <div className="waiting">
      <div className="card narrow">
        <div className="icon-box" style={{ margin: "0 auto 18px" }}>
          <Video size={19} />
        </div>
        <div className="eyebrow">WAITING ROOM</div>
        <h1>{meeting.title}</h1>
        <p className="muted">
          You’re in the waiting room. The host will let you in when ready.
        </p>
        <div className="badge" style={{ marginTop: 10 }}>
          Request pending
        </div>
        <button
          className="button secondary"
          style={{ marginTop: 22 }}
          onClick={() => window.history.back()}
        >
          <LogOut size={16} />
          Leave
        </button>
      </div>
    </div>
  );
}
