import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Copy, Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck, Users, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { invoke, type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { MeetingProvider, useMeeting, useParticipant } from "@videosdk.live/react-sdk";

type ParticipantRow = { id:string; meeting_id:string; user_id:string; role:"host"|"co_host"|"participant"; status:"waiting"|"admitted"|"rejected"|"left"|"removed"; joined_at:string|null; profiles?:{display_name:string;avatar_url:string|null}|null };
type MessageRow = { id:string; sender_id:string; message:string; created_at:string; profiles?:{display_name:string}|null };

export function VideoMeetingClient({ token, meeting, participant, displayName, onLeave }:{token:string;meeting:Meeting;participant:ParticipantRow;displayName:string;onLeave:()=>Promise<void>}) {
  return <MeetingProvider token={token} config={{meetingId:meeting.videosdk_meeting_id!,name:displayName,micEnabled:false,webcamEnabled:false}}><MeetingSession meeting={meeting} participant={participant} onLeave={onLeave}/></MeetingProvider>;
}

function MeetingSession({meeting,participant,onLeave}:{meeting:Meeting;participant:ParticipantRow;onLeave:()=>Promise<void>}) {
  const { user } = useAuth();
  const navigate = useMemo(() => undefined, []);
  const [chat,setChat] = useState<MessageRow[]>([]);
  const [text,setText] = useState("");
  const [people,setPeople] = useState<ParticipantRow[]>([]);
  const [copied,setCopied] = useState(false);
  const [joinStatus,setJoinStatus] = useState("CONNECTING");
  const joinStarted = useRef(false);

  const { join, meetingState } = useMeeting({
    onMeetingJoined: () => setJoinStatus("JOINED"),
    onMeetingLeft: () => setJoinStatus("LEFT"),
    onError: (error) => { console.error("[VideoSDK] meeting error", error); setJoinStatus("ERROR"); },
  });

  useEffect(() => {
    if (joinStarted.current) return;
    if (meetingState !== "IDLE") return;
    joinStarted.current = true;
    void Promise.resolve(join()).catch((error) => {
      console.error("[VideoSDK] join failed", error);
      joinStarted.current = false;
      setJoinStatus("ERROR");
    });
  }, [join, meetingState]);

  const joined = meetingState === "JOINED";

  const load = async () => {
    const { data } = await supabase.from("meeting_participants").select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").eq("meeting_id",meeting.id).order("created_at");
    setPeople((data ?? []) as unknown as ParticipantRow[]);
    const { data: msgs } = await supabase.from("meeting_messages").select("id,sender_id,message,created_at,profiles(display_name)").eq("meeting_id",meeting.id).order("created_at").limit(100);
    setChat((msgs ?? []) as unknown as MessageRow[]);
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel(`meeting-${meeting.id}`).on("postgres_changes",{event:"*",schema:"public",table:"meeting_participants",filter:`meeting_id=eq.${meeting.id}`},()=>void load()).on("postgres_changes",{event:"INSERT",schema:"public",table:"meeting_messages",filter:`meeting_id=eq.${meeting.id}`},payload=>setChat(v=>[...v,payload.new as MessageRow])).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meeting.id]);

  const send = async () => {
    const value = text.trim();
    if (!value || !user) return;
    setText("");
    const { error } = await supabase.from("meeting_messages").insert({meeting_id:meeting.id,sender_id:user.id,message:value});
    if (error) console.error(error);
  };

  const admit = async (id:string) => { try { await invoke("admit-participant",{meetingId:meeting.id,participantId:id}); } catch (e) { console.error(e); } };
  const reject = async (id:string) => { try { await invoke("reject-participant",{meetingId:meeting.id,participantId:id}); } catch (e) { console.error(e); } };
  const isHost = participant.role === "host" || participant.role === "co_host";

  const copy = () => { void navigator.clipboard.writeText(`${window.location.origin}/meeting/${meeting.public_slug}`).then(()=>{setCopied(true);window.setTimeout(()=>setCopied(false),1500)}).catch(console.error); };

  if (!joined) return <div className="meeting-page"><header className="meeting-header"><a href="/dashboard" className="brand"><span className="logo"><Video size={17}/></span><span>{meeting.title}</span></a></header><main className="meeting-main"><div className="card narrow"><div className="eyebrow">{joinStatus}</div><h1>Joining meeting…</h1><p className="muted">You can join without camera or microphone access. Turn them on after you enter.</p><button className="button secondary" style={{marginTop:14}} onClick={()=>void onLeave()}>Leave</button></div></main></div>;

  return <div className="meeting-page"><header className="meeting-header"><a href="/dashboard" className="brand"><span className="logo"><Video size={17}/></span><span style={{maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meeting.title}</span></a><div className="actions" style={{marginTop:0}}><button className="button secondary" onClick={copy}><Copy size={15}/>{copied?"Copied":"Share"}</button>{isHost&&<span className="badge"><ShieldCheck size={13}/> Host</span>}</div></header><main className="meeting-main"><VideoStage/><div className="meeting-card"><div className="meeting-row"><h2>People</h2><span className="badge">{people.filter(p=>p.status==="admitted").length} admitted</span></div>{isHost&&people.some(p=>p.status==="waiting")&&<div style={{marginTop:14}}><div className="eyebrow">WAITING</div>{people.filter(p=>p.status==="waiting").map(p=><div className="meeting-row" key={p.id} style={{padding:"10px 0",borderBottom:"1px solid #eef0f4"}}><span>{p.profiles?.display_name||"Guest"}</span><div className="actions" style={{marginTop:0}}><button className="button primary" onClick={()=>void admit(p.id)}>Admit</button><button className="button ghost" onClick={()=>void reject(p.id)}>Reject</button></div></div>)}</div>}{chat.length>0&&<div style={{marginTop:18,maxHeight:180,overflowY:"auto",background:"#f8fafc",borderRadius:12,padding:10}}>{chat.map(m=><div key={m.id} style={{fontSize:13,padding:"4px 0"}}><b>{m.profiles?.display_name||"Guest"}</b>: {m.message}</div>)}</div>}<div className="actions" style={{marginTop:12}}><input className="input" style={{flex:1}} placeholder="Message the meeting…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void send()}}/><button className="button secondary" onClick={()=>void send()}>Send</button></div></div></main><MeetingControls joined={joined} onLeave={onLeave}/></div>;
}

function VideoStage(){const {participants,meetingState}=useMeeting();const ids=useMemo(()=>Array.from(participants.keys()),[participants]);if(meetingState!=="JOINED")return <div className="video-grid"/>;return <div className="video-grid">{ids.map(id=><ParticipantTile key={id} participantId={id}/>)}</div>}
function ParticipantTile({participantId}:{participantId:string}){const {webcamStream,webcamOn,micStream,micOn,isLocal,displayName}=useParticipant(participantId);const videoRef=useRef<HTMLVideoElement>(null);const audioRef=useRef<HTMLAudioElement>(null);useEffect(()=>{const video=videoRef.current;if(!video)return;if(webcamOn&&webcamStream){const stream=new MediaStream([webcamStream.track]);video.srcObject=stream;void video.play().catch(()=>{});}else video.srcObject=null;return()=>{video.srcObject=null};},[webcamOn,webcamStream]);useEffect(()=>{const audio=audioRef.current;if(!audio)return;if(micOn&&micStream){const stream=new MediaStream([micStream.track]);audio.srcObject=stream;void audio.play().catch(()=>{});}else audio.srcObject=null;return()=>{audio.srcObject=null};},[micOn,micStream]);return <div className="video-tile">{webcamOn?<video ref={videoRef} autoPlay playsInline muted={isLocal}/>:<div className="avatar-fallback">{(displayName||"?").slice(0,1).toUpperCase()}</div>}<audio ref={audioRef} autoPlay playsInline muted={isLocal}/><span className="tile-label">{displayName||"Participant"}{micOn?"":" · muted"}</span></div>}
function MeetingControls({joined,onLeave}:{joined:boolean;onLeave:()=>Promise<void>}){const {toggleMic,toggleWebcam,enableScreenShare,micOn,webcamOn}=useMeeting();const [sharing,setSharing]=useState(false);const [busy,setBusy]=useState(false);const action=async(fn:()=>unknown)=>{if(!joined||busy)return;setBusy(true);try{await Promise.resolve(fn())}catch(error){console.error("VideoSDK media action failed",error)}finally{setBusy(false)}};return <div className="control-bar"><button disabled={!joined||busy} className={`control ${micOn?"active":""}`} title={joined?"Microphone":"Joining meeting…"} onClick={()=>void action(()=>toggleMic())}>{micOn?<Mic size={19}/>:<MicOff size={19}/>}</button><button disabled={!joined||busy} className={`control ${webcamOn?"active":""}`} title={joined?"Camera":"Joining meeting…"} onClick={()=>void action(()=>toggleWebcam())}>{webcamOn?<Camera size={19}/>:<CameraOff size={19}/>}</button><button disabled={!joined||busy} className={`control ${sharing?"active":""}`} title={joined?"Share screen":"Joining meeting…"} onClick={()=>void action(async()=>{await enableScreenShare();setSharing(true)})}><MonitorUp size={19}/></button><button className="control leave" title="Leave" onClick={()=>void onLeave()}><PhoneOff size={19}/></button></div>}
