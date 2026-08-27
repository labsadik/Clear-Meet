import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Camera, CameraOff, Check, Copy, MessageCircle, Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck, Users, Video, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { invoke, type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { MeetingProvider, useMeeting, useParticipant } from "@videosdk.live/react-sdk";

type ParticipantRow = { id:string; meeting_id:string; user_id:string; role:"host"|"co_host"|"participant"; status:"waiting"|"admitted"|"rejected"|"left"|"removed"; joined_at:string|null; profiles?:{display_name:string;avatar_url:string|null}|null };
type MessageRow = { id:string; sender_id:string; message:string; created_at:string; profiles?:{display_name:string}|null };
type Props = { token:string; meeting:Meeting; participant:ParticipantRow; displayName:string; initialMicEnabled:boolean; initialWebcamEnabled:boolean; onLeave:()=>Promise<void> };

export function VideoMeetingClient(props:Props){
  return <MeetingProvider token={props.token} config={{meetingId:props.meeting.videosdk_meeting_id!,name:props.displayName,micEnabled:false,webcamEnabled:false}} joinWithoutUserInteraction>
    <MeetingSession {...props}/>
  </MeetingProvider>;
}

function MeetingSession({meeting,participant,displayName,initialMicEnabled,initialWebcamEnabled,onLeave}:Props){
  const {user}=useAuth();
  const [chat,setChat]=useState<MessageRow[]>([]);
  const [text,setText]=useState("");
  const [people,setPeople]=useState<ParticipantRow[]>([]);
  const [chatOpen,setChatOpen]=useState(false);
  const [peopleOpen,setPeopleOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const [sdkJoined,setSdkJoined]=useState(false);
  const [joinError,setJoinError]=useState("");
  const [timedOut,setTimedOut]=useState(false);
  const initialDevicesApplied=useRef(false);

  const {meetingState,participants,presenterId,toggleMic,toggleWebcam,toggleScreenShare,micOn,webcamOn,screenShareOn}=useMeeting({
    onMeetingJoined:()=>{setSdkJoined(true);setJoinError("");setTimedOut(false);},
    onMeetingLeft:()=>setSdkJoined(false),
    onError:(error)=>{console.error("[VideoSDK] meeting error",error);setJoinError(error instanceof Error?error.message:"Could not connect to meeting.");},
  });
  const joined=sdkJoined;
  const participantIds=useMemo(()=>Array.from(participants.keys()),[participants]);

  useEffect(()=>{
    if(joined||joinError)return;
    const timeout=window.setTimeout(()=>{setTimedOut(true);setJoinError("The video service did not finish connecting. Check your network and try again.");},30000);
    return()=>window.clearTimeout(timeout);
  },[joined,joinError]);

  useEffect(()=>{
    if(!joined||initialDevicesApplied.current)return;
    initialDevicesApplied.current=true;
    const apply=async()=>{try{if(initialMicEnabled)await toggleMic();if(initialWebcamEnabled)await toggleWebcam();}catch(error){console.error("[VideoSDK] initial media setup failed",error);}};
    void apply();
  },[joined,initialMicEnabled,initialWebcamEnabled,toggleMic,toggleWebcam]);

  const load=async()=>{
    const {data}=await supabase.from("meeting_participants").select("id,meeting_id,user_id,role,status,joined_at,profiles(display_name,avatar_url)").eq("meeting_id",meeting.id).order("created_at");
    setPeople((data??[]) as unknown as ParticipantRow[]);
    const {data:messages}=await supabase.from("meeting_messages").select("id,sender_id,message,created_at,profiles(display_name)").eq("meeting_id",meeting.id).order("created_at").limit(100);
    setChat((messages??[]) as unknown as MessageRow[]);
  };

  useEffect(()=>{
    void load();
    const channel=supabase.channel(`meeting-${meeting.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"meeting_participants",filter:`meeting_id=eq.${meeting.id}`},()=>void load())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"meeting_messages",filter:`meeting_id=eq.${meeting.id}`},payload=>setChat(current=>{const next=[...current,payload.new as MessageRow];return next.length>100?next.slice(-100):next;}))
      .subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[meeting.id]);

  const send=async()=>{const value=text.trim();if(!value||!user)return;setText("");const {error}=await supabase.from("meeting_messages").insert({meeting_id:meeting.id,sender_id:user.id,message:value});if(error)console.error("[Meeting Chat] send failed",error);};
  const admit=async(id:string)=>{try{await invoke("admit-participant",{meetingId:meeting.id,participantId:id});}catch(error){console.error(error);}};
  const reject=async(id:string)=>{try{await invoke("reject-participant",{meetingId:meeting.id,participantId:id});}catch(error){console.error(error);}};
  const isHost=participant.role==="host"||participant.role==="co_host";
  const waiting=people.filter(p=>p.status==="waiting");
  const copyLink=()=>{void navigator.clipboard.writeText(`${window.location.origin}/meeting/${meeting.public_slug}`).then(()=>{setCopied(true);window.setTimeout(()=>setCopied(false),1500);}).catch(console.error);};

  if(!joined){
    return <div className="meeting-prejoin"><div className="prejoin-shell"><div className="prejoin-brand"><span className="meeting-brand-mark"><Video size={17}/></span><span>Clear Meet</span></div><div className="prejoin-card"><div className="prejoin-avatar">{(displayName||"U").slice(0,1).toUpperCase()}</div><div className="eyebrow">{joinError?"VIDEO ERROR":meetingState==="JOINING"?"CONNECTING":"PREPARING"}</div><h1>{joinError?"Couldn’t connect": "Joining meeting…"}</h1><p className="muted">{joinError||"You can enter without camera or microphone access. Devices are separate from joining."}</p><div className="prejoin-actions"><button className="button primary" onClick={()=>window.location.reload()}>{joinError||timedOut?"Try again":"Refresh connection"}</button><button className="button secondary" onClick={()=>void onLeave()}><PhoneOff size={16}/>Leave</button></div></div></div></div>;
  }

  return <div className="meeting-app">
    <header className="meeting-topbar">
      <a href="/dashboard" className="meeting-topbrand"><span className="meeting-brand-mark"><Video size={17}/></span><span className="meeting-name">{meeting.title}</span></a>
      <div className="meeting-top-actions">
        {isHost&&waiting.length>0&&<button className="meeting-pill meeting-pill-attention" onClick={()=>setPeopleOpen(true)}><Users size={15}/>{waiting.length} waiting</button>}
        <button className="meeting-icon-button" title="People" onClick={()=>setPeopleOpen(v=>!v)}><Users size={18}/><span>{people.filter(p=>p.status==="admitted").length}</span></button>
        <button className="meeting-icon-button" title="Chat" onClick={()=>setChatOpen(v=>!v)}><MessageCircle size={18}/>{chat.length>0&&<span className="meeting-notification-dot"/>}</button>
        <button className="meeting-share-button" onClick={copyLink}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?"Copied":"Share"}</button>
      </div>
    </header>

    <main className="meeting-workspace">
      <section className="meeting-stage">
        <div className="stage-toolbar">
          <div className="stage-status"><span className="live-dot"/>Live<span className="stage-divider"/>{participantIds.length} {participantIds.length===1?"person":"people"}</div>
          {presenterId&&<div className="presenter-banner"><MonitorUp size={14}/> {presenterId===participant.user_id?"You are presenting":"Someone is presenting"}</div>}
        </div>
        <div className="stage-canvas">{presenterId?<PresenterStage presenterId={presenterId}/>:<ParticipantGrid participantIds={participantIds}/>}</div>
      </section>

      {chatOpen&&<ChatPanel chat={chat} text={text} setText={setText} send={send} onClose={()=>setChatOpen(false)}/>} 
      {peopleOpen&&<PeoplePanel people={people} isHost={isHost} onClose={()=>setPeopleOpen(false)} onAdmit={admit} onReject={reject}/>} 
    </main>

    <MeetingControls joined={joined} micOn={micOn} webcamOn={webcamOn} screenShareOn={screenShareOn} toggleMic={toggleMic} toggleWebcam={toggleWebcam} toggleScreenShare={toggleScreenShare} onLeave={onLeave}/>
  </div>;
}

function ParticipantGrid({participantIds}:{participantIds:string[]}){
  if(participantIds.length===0)return <div className="meeting-empty-stage"><div className="meeting-empty-avatar"><Users size={28}/></div><h2>You’re the first one here</h2><p className="muted">Share the meeting link to invite others.</p></div>;
  return <div className={`meeting-grid meeting-grid-${Math.min(participantIds.length,4)}`}>{participantIds.map(id=><ParticipantTile key={id} participantId={id}/>)}</div>;
}

function ParticipantTile({participantId}:{participantId:string}){
  const {webcamStream,webcamOn,micStream,micOn,isLocal,displayName}=useParticipant(participantId);
  const videoRef=useRef<HTMLVideoElement>(null);const audioRef=useRef<HTMLAudioElement>(null);
  useEffect(()=>{const v=videoRef.current;if(!v)return;if(webcamOn&&webcamStream){v.srcObject=new MediaStream([webcamStream.track]);void v.play().catch(()=>undefined);}else v.srcObject=null;return()=>{v.srcObject=null;}},[webcamOn,webcamStream]);
  useEffect(()=>{const a=audioRef.current;if(!a)return;if(micOn&&micStream){a.srcObject=new MediaStream([micStream.track]);void a.play().catch(()=>undefined);}else a.srcObject=null;return()=>{a.srcObject=null;}},[micOn,micStream]);
  return <article className="person-card"><div className="person-media">{webcamOn?<video ref={videoRef} autoPlay playsInline muted={isLocal}/>:<div className="person-avatar">{(displayName||"?").slice(0,1).toUpperCase()}</div>}<audio ref={audioRef} autoPlay playsInline muted={isLocal}/><div className="person-overlay"><div className="person-name"><span>{displayName||"Participant"}</span>{isLocal&&<span className="you-label">You</span>}</div><span className={`media-status ${micOn?"on":"off"}`}>{micOn?<Mic size={13}/>:<MicOff size={13}/>}</span></div>{!webcamOn&&<span className="camera-off-label"><CameraOff size={13}/>Camera off</span>}</div></article>;
}

function PresenterStage({presenterId}:{presenterId:string}){
  const {screenShareStream,screenShareOn,displayName}=useParticipant(presenterId);const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{const v=ref.current;if(!v)return;if(screenShareOn&&screenShareStream){v.srcObject=new MediaStream([screenShareStream.track]);void v.play().catch(()=>undefined);}else v.srcObject=null;return()=>{v.srcObject=null;}},[screenShareOn,screenShareStream]);
  if(!screenShareOn||!screenShareStream)return <ParticipantGrid participantIds={[presenterId]}/>;
  return <div className="presenter-stage"><video ref={ref} autoPlay playsInline muted/><div className="presenter-caption"><MonitorUp size={15}/><span>{displayName||"Participant"} is presenting</span></div></div>;
}

function ChatPanel({chat,text,setText,send,onClose}:{chat:MessageRow[];text:string;setText:(v:string)=>void;send:()=>Promise<void>;onClose:()=>void}){
 return <aside className="meeting-panel meeting-chat-panel"><div className="panel-header"><div><strong>In-call messages</strong><span>{chat.length} recent</span></div><button className="panel-close" onClick={onClose}><X size={18}/></button></div><div className="chat-list">{chat.length===0?<div className="panel-empty"><MessageCircle size={25}/><strong>No messages yet</strong><span>Start the conversation.</span></div>:chat.map(message=><div className="chat-message" key={message.id}><div className="chat-avatar">{(message.profiles?.display_name||"G").slice(0,1).toUpperCase()}</div><div><div className="chat-meta">{message.profiles?.display_name||"Guest"}</div><div className="chat-bubble">{message.message}</div></div></div>)}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();void send();}}><input className="input" placeholder="Send a message" value={text} onChange={e=>setText(e.target.value)}/><button className="button primary" type="submit" disabled={!text.trim()}>Send</button></form></aside>;
}

function PeoplePanel({people,isHost,onClose,onAdmit,onReject}:{people:ParticipantRow[];isHost:boolean;onClose:()=>void;onAdmit:(id:string)=>Promise<void>;onReject:(id:string)=>Promise<void>}){
 const waiting=people.filter(p=>p.status==="waiting");const admitted=people.filter(p=>p.status==="admitted");
 return <aside className="meeting-panel people-panel"><div className="panel-header"><div><strong>People</strong><span>{admitted.length} in the meeting</span></div><button className="panel-close" onClick={onClose}><X size={18}/></button></div><div className="people-list">{isHost&&waiting.length>0&&<section className="people-section"><div className="people-section-title">Waiting to join</div>{waiting.map(person=><div className="people-row" key={person.id}><div className="mini-avatar">{(person.profiles?.display_name||"G").slice(0,1).toUpperCase()}</div><div className="people-row-main"><strong>{person.profiles?.display_name||"Guest"}</strong><span>Requesting access</span></div><div className="people-actions"><button className="mini-action approve" onClick={()=>void onAdmit(person.id)}><Check size={15}/></button><button className="mini-action reject" onClick={()=>void onReject(person.id)}><X size={15}/></button></div></div>)}</section>}<section className="people-section"><div className="people-section-title">In the meeting</div>{admitted.map(person=><div className="people-row" key={person.id}><div className="mini-avatar">{(person.profiles?.display_name||"G").slice(0,1).toUpperCase()}</div><div className="people-row-main"><strong>{person.profiles?.display_name||"Guest"}</strong><span>{person.role==="host"?"Host":person.role==="co_host"?"Co-host":"Participant"}</span></div><span className="people-state"><Check size={14}/></span></div>)}</section></div></aside>;
}

function MeetingControls({joined,micOn,webcamOn,screenShareOn,toggleMic,toggleWebcam,toggleScreenShare,onLeave}:{joined:boolean;micOn:boolean;webcamOn:boolean;screenShareOn:boolean;toggleMic:()=>unknown;toggleWebcam:()=>unknown;toggleScreenShare:()=>unknown;onLeave:()=>Promise<void>}){
 const [busy,setBusy]=useState<string|null>(null);
 const run=async(kind:string,action:()=>unknown)=>{if(!joined||busy)return;setBusy(kind);try{await Promise.resolve(action());}catch(error){console.error(`[VideoSDK] ${kind} failed`,error);}finally{setBusy(null);}};
 return <footer className="meeting-controls"><div className="controls-cluster"><ControlButton active={micOn} disabled={!joined||!!busy} label={micOn?"Mute microphone":"Turn on microphone"} icon={micOn?<Mic size={20}/>:<MicOff size={20}/>} onClick={()=>void run("mic",toggleMic)}/><ControlButton active={webcamOn} disabled={!joined||!!busy} label={webcamOn?"Turn camera off":"Turn camera on"} icon={webcamOn?<Camera size={20}/>:<CameraOff size={20}/>} onClick={()=>void run("camera",toggleWebcam)}/><ControlButton active={screenShareOn} disabled={!joined||!!busy} label={screenShareOn?"Stop sharing":"Share screen"} icon={<MonitorUp size={20}/>} onClick={()=>void run("share",toggleScreenShare)}/></div><span className="meeting-control-note">{joined?"Connected securely":"Connecting…"}</span><button className="leave-call-button" onClick={()=>void onLeave()}><PhoneOff size={20}/><span>Leave</span></button></footer>;
}

function ControlButton({active,disabled,label,icon,onClick}:{active:boolean;disabled:boolean;label:string;icon:ReactNode;onClick:()=>void}){
 return <button className={`meeting-control-button ${active?"active":""}`} disabled={disabled} title={label} aria-label={label} onClick={onClick}>{icon}</button>;
}
