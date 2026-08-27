import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Copy,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { invoke, type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
} from "@videosdk.live/react-sdk";

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

type MessageRow = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  profiles?: { display_name: string } | null;
};

type Props = {
  token: string;
  meeting: Meeting;
  participant: ParticipantRow;
  displayName: string;
  initialMicEnabled: boolean;
  initialWebcamEnabled: boolean;
  onLeave: () => Promise<void>;
};

export function VideoMeetingClient({
  token,
  meeting,
  participant,
  displayName,
  initialMicEnabled,
  initialWebcamEnabled,
  onLeave,
}: Props) {
  return (
    <MeetingProvider
      token={token}
      config={{
        meetingId: meeting.videosdk_meeting_id!,
        name: displayName,
        micEnabled: false,
        webcamEnabled: false,
      }}
      joinWithoutUserInteraction
    >
      <MeetingSession
        meeting={meeting}
        participant={participant}
        initialMicEnabled={initialMicEnabled}
        initialWebcamEnabled={initialWebcamEnabled}
        onLeave={onLeave}
      />
    </MeetingProvider>
  );
}

function MeetingSession({
  meeting,
  participant,
  initialMicEnabled,
  initialWebcamEnabled,
  onLeave,
}: Omit<Props, "token" | "displayName">) {
  const { user } = useAuth();
  const [chat, setChat] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<ParticipantRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [sdkJoined, setSdkJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const initialDevicesApplied = useRef(false);

  const {
    meetingState,
    toggleMic,
    toggleWebcam,
    enableScreenShare,
  } = useMeeting({
    onMeetingJoined: () => {
      setSdkJoined(true);
      setJoinError("");
      setTimedOut(false);
      console.log("[VideoSDK] meeting joined");
    },
    onMeetingLeft: () => {
      setSdkJoined(false);
      console.log("[VideoSDK] meeting left");
    },
    onError: (error) => {
      console.error("[VideoSDK] meeting error", error);
      setJoinError(
        error instanceof Error
          ? error.message
          : "Could not connect to the video meeting.",
      );
    },
  });

  const joined = sdkJoined;
  const connecting = !sdkJoined &&
    (meetingState === "JOINING" || meetingState === "IDLE");

  useEffect(() => {
    if (joined || joinError) return;

    const timeout = window.setTimeout(() => {
      setTimedOut(true);
      setJoinError(
        "The video service did not finish connecting. Please try again.",
      );
    }, 30000);

    return () => window.clearTimeout(timeout);
  }, [joined, joinError]);

  useEffect(() => {
    if (!joined || initialDevicesApplied.current) return;

    initialDevicesApplied.current = true;

    const applyInitialDevices = async () => {
      try {
        if (initialMicEnabled) await toggleMic();
        if (initialWebcamEnabled) await toggleWebcam();
      } catch (error) {
        console.error(
          "[VideoSDK] Could not enable selected devices:",
          error,
        );
      }
    };

    void applyInitialDevices();
  }, [
    joined,
    initialMicEnabled,
    initialWebcamEnabled,
    toggleMic,
    toggleWebcam,
  ]);

  const load = async () => {
    const { data } = await supabase
      .from("meeting_participants")
      .select(
        "id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)",
      )
      .eq("meeting_id", meeting.id)
      .order("created_at");

    setPeople((data ?? []) as unknown as ParticipantRow[]);

    const { data: messages } = await supabase
      .from("meeting_messages")
      .select("id,sender_id,message,created_at,profiles(display_name)")
      .eq("meeting_id", meeting.id)
      .order("created_at")
      .limit(100);

    setChat((messages ?? []) as unknown as MessageRow[]);
  };

  useEffect(() => {
    void load();

    const channel = supabase
      .channel(`meeting-${meeting.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_participants",
          filter: `meeting_id=eq.${meeting.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_messages",
          filter: `meeting_id=eq.${meeting.id}`,
        },
        (payload) => {
          setChat((current) => [
            ...current,
            payload.new as MessageRow,
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meeting.id]);

  const send = async () => {
    const value = text.trim();
    if (!value || !user) return;

    setText("");

    const { error } = await supabase
      .from("meeting_messages")
      .insert({
        meeting_id: meeting.id,
        sender_id: user.id,
        message: value,
      });

    if (error) {
      console.error("[Meeting Chat] Failed to send:", error);
    }
  };

  const admit = async (id: string) => {
    try {
      await invoke("admit-participant", {
        meetingId: meeting.id,
        participantId: id,
      });
    } catch (error) {
      console.error("[Meeting] Failed to admit participant:", error);
    }
  };

  const reject = async (id: string) => {
    try {
      await invoke("reject-participant", {
        meetingId: meeting.id,
        participantId: id,
      });
    } catch (error) {
      console.error("[Meeting] Failed to reject participant:", error);
    }
  };

  const isHost =
    participant.role === "host" || participant.role === "co_host";

  const copy = () => {
    void navigator.clipboard
      .writeText(
        `${window.location.origin}/meeting/${meeting.public_slug}`,
      )
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((error) => {
        console.error("[Meeting] Failed to copy link:", error);
      });
  };

  const statusText = joinError
    ? "Could not connect"
    : timedOut
      ? "Connection timed out"
      : connecting
        ? "Connecting"
        : "Preparing";

  if (!joined) {
    return (
      <div className="meeting-page">
        <header className="meeting-header">
          <a href="/dashboard" className="brand">
            <span className="logo">
              <Video size={17} />
            </span>
            <span>{meeting.title}</span>
          </a>
        </header>

        <main className="meeting-main">
          <div className="card narrow">
            <div className="eyebrow">
              {joinError || timedOut ? "VIDEO ERROR" : statusText.toUpperCase()}
            </div>
            <h1>
              {joinError || timedOut
                ? "Could not connect to meeting"
                : "Connecting to meeting…"}
            </h1>
            <p className="muted">
              {joinError || timedOut
                ? joinError
                : "The meeting is entered independently of your camera and microphone. You can turn devices on after joining."}
            </p>
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
              <button
                className="button secondary"
                onClick={() => void onLeave()}
              >
                Leave
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="meeting-page">
      <header className="meeting-header">
        <a href="/dashboard" className="brand">
          <span className="logo">
            <Video size={17} />
          </span>
          <span
            style={{
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meeting.title}
          </span>
        </a>

        <div className="actions" style={{ marginTop: 0 }}>
          <button className="button secondary" onClick={copy}>
            <Copy size={15} />
            {copied ? "Copied" : "Share"}
          </button>

          {isHost && (
            <span className="badge">
              <ShieldCheck size={13} /> Host
            </span>
          )}
        </div>
      </header>

      <main className="meeting-main">
        <VideoStage />

        <div className="meeting-card">
          <div className="meeting-row">
            <h2>People</h2>
            <span className="badge">
              {people.filter((person) => person.status === "admitted").length} admitted
            </span>
          </div>

          {isHost &&
            people.some((person) => person.status === "waiting") && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow">WAITING</div>
                {people
                  .filter((person) => person.status === "waiting")
                  .map((person) => (
                    <div
                      className="meeting-row"
                      key={person.id}
                      style={{
                        padding: "10px 0",
                        borderBottom: "1px solid #eef0f4",
                      }}
                    >
                      <span>
                        {person.profiles?.display_name || "Guest"}
                      </span>
                      <div className="actions" style={{ marginTop: 0 }}>
                        <button
                          className="button primary"
                          onClick={() => void admit(person.id)}
                        >
                          Admit
                        </button>
                        <button
                          className="button ghost"
                          onClick={() => void reject(person.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

          {chat.length > 0 && (
            <div
              style={{
                marginTop: 18,
                maxHeight: 180,
                overflowY: "auto",
                background: "#f8fafc",
                borderRadius: 12,
                padding: 10,
              }}
            >
              {chat.map((message) => (
                <div
                  key={message.id}
                  style={{ fontSize: 13, padding: "4px 0" }}
                >
                  <b>{message.profiles?.display_name || "Guest"}</b>: {message.message}
                </div>
              ))}
            </div>
          )}

          <div className="actions" style={{ marginTop: 12 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Message the meeting…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send();
              }}
            />
            <button
              className="button secondary"
              onClick={() => void send()}
            >
              Send
            </button>
          </div>
        </div>
      </main>

      <MeetingControls
        joined={joined}
        toggleMic={toggleMic}
        toggleWebcam={toggleWebcam}
        enableScreenShare={enableScreenShare}
        onLeave={onLeave}
      />
    </div>
  );
}

function VideoStage() {
  const { participants } = useMeeting();
  const ids = useMemo(
    () => Array.from(participants.keys()),
    [participants],
  );

  if (ids.length === 0) {
    return (
      <div className="video-grid">
        <div className="video-tile">
          <div className="avatar-fallback">You</div>
          <span className="tile-label">You are the first person here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="video-grid">
      {ids.map((id) => (
        <ParticipantTile key={id} participantId={id} />
      ))}
    </div>
  );
}

function ParticipantTile({ participantId }: { participantId: string }) {
  const {
    webcamStream,
    webcamOn,
    micStream,
    micOn,
    isLocal,
    displayName,
  } = useParticipant(participantId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (webcamOn && webcamStream) {
      video.srcObject = new MediaStream([webcamStream.track]);
      void video.play().catch(() => undefined);
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [webcamOn, webcamStream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (micOn && micStream) {
      audio.srcObject = new MediaStream([micStream.track]);
      void audio.play().catch(() => undefined);
    } else {
      audio.srcObject = null;
    }

    return () => {
      audio.srcObject = null;
    };
  }, [micOn, micStream]);

  return (
    <div className="video-tile">
      {webcamOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className="avatar-fallback">
          {(displayName || "?").slice(0, 1).toUpperCase()}
        </div>
      )}

      <audio
        ref={audioRef}
        autoPlay
        playsInline
        muted={isLocal}
      />

      <span className="tile-label">
        {displayName || "Participant"}
        {micOn ? "" : " · muted"}
      </span>
    </div>
  );
}

function MeetingControls({
  joined,
  toggleMic,
  toggleWebcam,
  enableScreenShare,
  onLeave,
}: {
  joined: boolean;
  toggleMic: () => Promise<unknown>;
  toggleWebcam: () => Promise<unknown>;
  enableScreenShare: () => Promise<unknown>;
  onLeave: () => Promise<void>;
}) {
  const { micOn, webcamOn } = useMeeting();
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  const action = async (fn: () => unknown) => {
    if (!joined || busy) return;

    setBusy(true);

    try {
      await Promise.resolve(fn());
    } catch (error) {
      console.error("[VideoSDK] media action failed:", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="control-bar">
      <button
        disabled={!joined || busy}
        className={`control ${micOn ? "active" : ""}`}
        title="Microphone"
        onClick={() => void action(() => toggleMic())}
      >
        {micOn ? <Mic size={19} /> : <MicOff size={19} />}
      </button>

      <button
        disabled={!joined || busy}
        className={`control ${webcamOn ? "active" : ""}`}
        title="Camera"
        onClick={() => void action(() => toggleWebcam())}
      >
        {webcamOn ? <Camera size={19} /> : <CameraOff size={19} />}
      </button>

      <button
        disabled={!joined || busy}
        className={`control ${sharing ? "active" : ""}`}
        title="Share screen"
        onClick={() =>
          void action(async () => {
            await enableScreenShare();
            setSharing(true);
          })
        }
      >
        <MonitorUp size={19} />
      </button>

      <button
        className="control leave"
        title="Leave"
        onClick={() => void onLeave()}
      >
        <PhoneOff size={19} />
      </button>
    </div>
  );
}
