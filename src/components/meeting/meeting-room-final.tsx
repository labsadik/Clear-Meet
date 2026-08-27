import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, CameraOff, Check, Copy, MessageCircle, Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck, Users, Video, X } from "lucide-react";
import { MeetingProvider, useMeeting, useParticipant } from "@videosdk.live/react-sdk";
import { useAuth } from "@/lib/auth-context";
import { invoke, type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

type ParticipantRow = { id: string; meeting_id: string; user_id: string; role: "host" | "co_host" | "participant"; status: "waiting" | "admitted" | "rejected" | "left" | "removed"; joined_at: string | null; profiles?: { display_name: string; avatar_url: string | null } | null };
type MessageRow = { id: string; sender_id: string; message: string; created_at: string; profiles?: { display_name: string } | null };
export type MeetingRoomProps = { token: string; meeting: Meeting; participant: ParticipantRow; displayName: string; initialMicEnabled: boolean; initialWebcamEnabled: boolean; onLeave: () => Promise<void> };

const speakerColors = ["#2563eb", "#7c3aed", "#059669", "#db2777", "#0891b2", "#ea580c"];
const colorFor = (id: string) => speakerColors[Math.abs([...id].reduce((n, c) => n + c.charCodeAt(0), 0)) % speakerColors.length];

export function MeetingRoomFinal(props: MeetingRoomProps) {
  return <MeetingProvider token={props.token} config={{ meetingId: props.meeting.videosdk_meeting_id!, name: props.displayName, micEnabled: false, webcamEnabled: false }} joinWithoutUserInteraction><MeetingSession {...props} /></MeetingProvider>;
}

function MeetingSession({ meeting, participant, displayName, initialMicEnabled, initialWebcamEnabled, onLeave }: MeetingRoomProps) {
  const { user } = useAuth();
  const [chat, setChat] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<ParticipantRow[]>([]);
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const initialDevicesApplied = useRef(false);

  const { meetingState, participants, presenterId, micOn, webcamOn, screenShareOn, toggleMic, toggleWebcam, toggleScreenShare } = useMeeting({
    onMeetingJoined: () => { setJoined(true); setJoinError(""); },
    onMeetingLeft: () => setJoined(false),
    onSpeakerChanged: (id: string | null) => setActiveSpeakerId(id),
    onError: (error) => { console.error("[VideoSDK]", error); setJoinError(error instanceof Error ? error.message : "Could not connect to the meeting."); },
  });

  const participantIds = useMemo(() => Array.from(participants.keys()), [participants]);
  const admittedCount = people.filter((p) => p.status === "admitted").length;
  const waiting = people.filter((p) => p.status === "waiting");
  const isHost = participant.role === "host" || participant.role === "co_host";

  useEffect(() => {
    if (!joined || initialDevicesApplied.current) return;
    initialDevicesApplied.current = true;
    void (async () => {
      try { if (initialMicEnabled) await toggleMic(); if (initialWebcamEnabled) await toggleWebcam(); }
      catch (error) { console.error("[VideoSDK] initial media setup failed", error); }
    })();
  }, [joined, initialMicEnabled, initialWebcamEnabled, toggleMic, toggleWebcam]);

  useEffect(() => {
    if (joined || joinError) return;
    const timer = window.setTimeout(() => setJoinError("The video service did not finish connecting. Please try again."), 30000);
    return () => window.clearTimeout(timer);
  }, [joined, joinError]);

  const loadPeopleAndChat = async () => {
    const [{ data: participantRows }, { data: messages }] = await Promise.all([
      supabase.from("meeting_participants").select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").eq("meeting_id", meeting.id).order("created_at"),
      supabase.from("meeting_messages").select("id,sender_id,message,created_at,profiles(display_name)").eq("meeting_id", meeting.id).order("created_at").limit(100),
    ]);
    setPeople((participantRows ?? []) as unknown as ParticipantRow[]);
    setChat((messages ?? []) as unknown as MessageRow[]);
  };

  useEffect(() => {
    void loadPeopleAndChat();
    const channel = supabase.channel(`meeting-live-${meeting.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants", filter: `meeting_id=eq.${meeting.id}` }, () => void loadPeopleAndChat())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_messages", filter: `meeting_id=eq.${meeting.id}` }, (payload) => setChat((current) => [...current, payload.new as MessageRow].slice(-100)))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meeting.id]);

  const send = async () => {
    const message = text.trim();
    if (!message || !user) return;
    setText("");
    const { error } = await supabase.from("meeting_messages").insert({ meeting_id: meeting.id, sender_id: user.id, message });
    if (error) console.error("[Meeting Chat]", error);
  };

  const copyLink = () => void navigator.clipboard.writeText(`${window.location.origin}/meeting/${meeting.public_slug}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); });
  const admit = async (id: string) => { try { await invoke("admit-participant", { meetingId: meeting.id, participantId: id }); } catch (e) { console.error(e); } };
  const reject = async (id: string) => { try { await invoke("reject-participant", { meetingId: meeting.id, participantId: id }); } catch (e) { console.error(e); } };

  if (!joined) return <div className="meet-join-shell"><div className="meet-join-card"><div className="meet-join-logo"><Video size={18} /></div><div className="eyebrow">{joinError ? "CONNECTION ISSUE" : meetingState === "JOINING" ? "CONNECTING" : "READY"}</div><h1>{joinError ? "Couldn’t connect" : "Joining meeting…"}</h1><p className="muted">{joinError || "The room does not require camera or microphone permission. You can enable devices after entering."}</p><div className="join-actions"><button className="button primary" onClick={() => window.location.reload()}>{joinError ? "Try again" : "Refresh"}</button><button className="button secondary" onClick={() => void onLeave()}><PhoneOff size={16}/>Leave</button></div></div></div>;

  return <div className="meet-shell">
    <header className="meet-topbar glass-surface">
      <a className="meet-brand" href="/dashboard"><span className="meet-brand-mark"><Video size={16}/></span><span className="meet-title">{meeting.title}</span></a>
      <div className="meet-top-actions">
        {isHost && waiting.length > 0 && <button className="meet-alert-pill" onClick={() => setPanel("people")}><Users size={15}/>{waiting.length} waiting</button>}
        <button className="meet-top-button" onClick={() => setPanel(panel === "people" ? null : "people")}><Users size={17}/><span>{admittedCount}</span></button>
        <button className="meet-top-button" onClick={() => setPanel(panel === "chat" ? null : "chat")}><MessageCircle size={17}/>{chat.length > 0 && <i className="meet-dot"/>}</button>
        <button className="meet-share" onClick={copyLink}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? "Copied" : "Share"}</span></button>
      </div>
    </header>

    <main className="meet-body">
      <section className="meet-stage">
        <div className="meet-stage-bar"><span><i className="meet-live"/>Live</span><span className="meet-separator"/ ><span>{participantIds.length} {participantIds.length === 1 ? "participant" : "participants"}</span>{presenterId && <span className="meet-presenting"><MonitorUp size={14}/>{presenterId === participant.user_id ? "You are presenting" : "Screen being shared"}</span>}</div>
        <div className="meet-media-layout">
          {presenterId ? <><div className="meet-presentation"><Presenter presenterId={presenterId}/></div><div className="meet-filmstrip">{participantIds.map((id) => <ParticipantCard key={id} participantId={id} active={id === activeSpeakerId} color={colorFor(id)} compact />)}</div></> : <div className="meet-grid">{participantIds.map((id) => <ParticipantCard key={id} participantId={id} active={id === activeSpeakerId} color={colorFor(id)} />)}</div>}
        </div>
      </section>

      {panel === "chat" && <ChatPanel chat={chat} text={text} setText={setText} send={send} onClose={() => setPanel(null)} />}
      {panel === "people" && <PeoplePanel people={people} isHost={isHost} onClose={() => setPanel(null)} onAdmit={admit} onReject={reject} />}
    </main>

    <footer className="meet-controls glass-surface">
      <div className="meet-controls-left"><span className="meet-control-status">{joined ? "Connected" : "Connecting…"}</span></div>
      <div className="meet-control-center">
        <MediaButton active={micOn} label={micOn ? "Mute microphone" : "Turn on microphone"} icon={micOn ? <Mic size={20}/> : <MicOff size={20}/>} onClick={() => void toggleSafely(toggleMic)} />
        <MediaButton active={webcamOn} label={webcamOn ? "Turn camera off" : "Turn camera on"} icon={webcamOn ? <Camera size={20}/> : <CameraOff size={20}/>} onClick={() => void toggleSafely(toggleWebcam)} />
        <MediaButton active={screenShareOn} label={screenShareOn ? "Stop sharing" : "Share screen"} icon={<MonitorUp size={20}/>} onClick={() => void toggleSafely(toggleScreenShare)} />
      </div>
      <button className="meet-leave" onClick={() => void onLeave()}><PhoneOff size={20}/><span>Leave</span></button>
    </footer>
  </div>;
}

async function toggleSafely(action: () => unknown) { try { await Promise.resolve(action()); } catch (error) { console.error("[VideoSDK] control failed", error); } }

function ParticipantCard({ participantId, active, color, compact = false }: { participantId: string; active: boolean; color: string; compact?: boolean }) {
  const { webcamStream, webcamOn, micStream, micOn, isLocal, displayName } = useParticipant(participantId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => { const v = videoRef.current; if (!v) return; v.srcObject = webcamOn && webcamStream ? new MediaStream([webcamStream.track]) : null; if (v.srcObject) void v.play().catch(() => undefined); return () => { v.srcObject = null; }; }, [webcamOn, webcamStream]);
  useEffect(() => { const a = audioRef.current; if (!a) return; a.srcObject = micOn && micStream ? new MediaStream([micStream.track]) : null; if (a.srcObject) void a.play().catch(() => undefined); return () => { a.srcObject = null; }; }, [micOn, micStream]);
  return <article className={`meet-person ${compact ? "compact" : ""} ${active ? "speaking" : ""}`} style={active ? ({ "--speaker-color": color } as React.CSSProperties) : undefined}><div className="meet-person-media">{webcamOn ? <video ref={videoRef} autoPlay playsInline muted={isLocal}/> : <div className="meet-person-avatar">{(displayName || "?").slice(0, 1).toUpperCase()}</div>}<audio ref={audioRef} autoPlay playsInline muted={isLocal}/><div className="meet-person-bottom"><span className="meet-person-name">{displayName || "Participant"}{isLocal && <small>You</small>}</span><span className={`meet-mic-state ${micOn ? "on" : "off"}`}>{micOn ? <Mic size={13}/> : <MicOff size={13}/>}</span></div>{!webcamOn && <span className="meet-camera-off"><CameraOff size={12}/>Camera off</span>}</div></article>;
}

function Presenter({ presenterId }: { presenterId: string }) { const { screenShareStream, screenShareOn, screenShareAudioStream, isLocal, displayName } = useParticipant(presenterId); const videoRef = useRef<HTMLVideoElement>(null); const audioRef = useRef<HTMLAudioElement>(null); useEffect(() => { const v = videoRef.current; if (!v) return; v.srcObject = screenShareOn && screenShareStream ? new MediaStream([screenShareStream.track]) : null; if (v.srcObject) void v.play().catch(() => undefined); return () => { v.srcObject = null; }; }, [screenShareOn, screenShareStream]); useEffect(() => { const a = audioRef.current; if (!a) return; a.srcObject = !isLocal && screenShareOn && screenShareAudioStream ? new MediaStream([screenShareAudioStream.track]) : null; if (a.srcObject) void a.play().catch(() => undefined); return () => { a.srcObject = null; }; }, [isLocal, screenShareOn, screenShareAudioStream]); return <div className="meet-presenter"><video ref={videoRef} autoPlay playsInline muted/><audio ref={audioRef} autoPlay playsInline muted={isLocal}/><div className="meet-presenter-label"><MonitorUp size={15}/><span>{isLocal ? "You are presenting" : `${displayName || "Participant"} is presenting`}</span></div></div>; }

function ChatPanel({ chat, text, setText, send, onClose }: { chat: MessageRow[]; text: string; setText: (v: string) => void; send: () => Promise<void>; onClose: () => void }) { return <aside className="meet-panel"><div className="meet-panel-head"><div><strong>Chat</strong><span>{chat.length} messages</span></div><button onClick={onClose}><X size={18}/></button></div><div className="meet-chat-list">{chat.length === 0 ? <div className="meet-empty-panel"><MessageCircle size={26}/><strong>No messages yet</strong><span>Start the conversation.</span></div> : chat.map((m) => <div className="meet-chat-item" key={m.id}><span className="meet-chat-avatar">{(m.profiles?.display_name || "G").slice(0,1).toUpperCase()}</span><div><b>{m.profiles?.display_name || "Guest"}</b><p>{m.message}</p></div></div>)}</div><form className="meet-chat-form" onSubmit={(e) => { e.preventDefault(); void send(); }}><input className="input" placeholder="Send a message…" value={text} onChange={(e) => setText(e.target.value)} /><button className="button primary" disabled={!text.trim()}>Send</button></form></aside>; }

function PeoplePanel({ people, isHost, onClose, onAdmit, onReject }: { people: ParticipantRow[]; isHost: boolean; onClose: () => void; onAdmit: (id: string) => Promise<void>; onReject: (id: string) => Promise<void> }) { const waiting = people.filter((p) => p.status === "waiting"); const admitted = people.filter((p) => p.status === "admitted"); return <aside className="meet-panel"><div className="meet-panel-head"><div><strong>People</strong><span>{admitted.length} in the meeting</span></div><button onClick={onClose}><X size={18}/></button></div><div className="meet-people-list">{isHost && waiting.length > 0 && <div className="meet-people-section"><label>Waiting to join</label>{waiting.map((p) => <div className="meet-person-row" key={p.id}><span className="meet-mini-avatar">{(p.profiles?.display_name || "G").slice(0,1).toUpperCase()}</span><div><b>{p.profiles?.display_name || "Guest"}</b><small>Requesting access</small></div><span className="meet-row-actions"><button onClick={() => void onAdmit(p.id)}><Check size={15}/></button><button onClick={() => void onReject(p.id)}><X size={15}/></button></span></div>)}</div>}<div className="meet-people-section"><label>In the meeting</label>{admitted.map((p) => <div className="meet-person-row" key={p.id}><span className="meet-mini-avatar">{(p.profiles?.display_name || "G").slice(0,1).toUpperCase()}</span><div><b>{p.profiles?.display_name || "Guest"}</b><small>{p.role === "host" ? "Host" : p.role === "co_host" ? "Co-host" : "Participant"}</small></div><Check size={15} className="meet-check"/></div>)}</div></div></aside>; }

function MediaButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) { return <button className={`meet-media-button ${active ? "active" : ""}`} aria-label={label} title={label} onClick={onClick}>{icon}</button>; }
