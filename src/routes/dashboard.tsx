import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LogOut, Plus, Video } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { type Meeting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("meetings")
      .select("id,host_id,title,public_slug,videosdk_meeting_id,status,created_at")
      .eq("host_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) setError(queryError.message);
        else setMeetings((data ?? []) as Meeting[]);
      });
    return () => { cancelled = true; };
  }, [user]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { invoke } = await import("@/lib/api");
      const result = await invoke<{ meeting: Meeting }>("create-meeting", { title: title.trim() });
      setMeetings((current) => [result.meeting, ...current]);
      setTitle("");
      setShowCreate(false);
      void navigate({ to: "/meeting/$meetingSlug", params: { meetingSlug: result.meeting.public_slug } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create meeting");
    } finally {
      setBusy(false);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const value = slug.trim().replace(/^\/meeting\//, "");
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      // The meeting route performs the single server-side admission/join check.
      // Avoid making the same request here before navigating.
      void navigate({ to: "/meeting/$meetingSlug", params: { meetingSlug: value } });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !user) {
    return <div className="center-page"><div className="card narrow"><p className="muted">Loading your account…</p></div></div>;
  }

  const avatar = profile?.avatar_url;
  const firstName = profile?.display_name?.split(" ")[0] || "there";

  return <div className="page">
    <header className="nav dashboard-nav">
      <Link to="/" className="brand"><span className="logo"><Video size={18} /></span>Clear Meet</Link>
      <div className="nav-links">
        <Link to="/profile" className="account-chip">
          {avatar ? <img src={avatar} alt="" className="account-avatar" /> : <span className="account-avatar account-avatar-fallback">{firstName.slice(0, 1).toUpperCase()}</span>}
          <span>{profile?.display_name || user.email}</span>
        </Link>
        <button className="button secondary" onClick={() => void signOut()}><LogOut size={16} />Sign out</button>
      </div>
    </header>

    <main className="container">
      <section className="dashboard-hero">
        <div>
          <div className="eyebrow">DASHBOARD</div>
          <h1>Good to see you, {firstName}.</h1>
          <p className="muted">Start a room, share the link, and meet from any modern browser.</p>
        </div>
        <Link className="button secondary profile-shortcut" to="/profile">Edit profile</Link>
      </section>

      {error && <div className="error" style={{ marginTop: 18 }}>{error}</div>}

      <div className="dashboard-grid">
        <section className="meeting-card dashboard-create-card">
          <div className="meeting-row">
            <div><div className="icon-box"><Plus size={18} /></div><h2 style={{ marginTop: 14 }}>Start a meeting</h2><p className="muted">Create a secure room with a shareable link.</p></div>
            <button className="button primary" onClick={() => setShowCreate((value) => !value)}><Plus size={17} />New meeting</button>
          </div>
          {showCreate && <form className="form" onSubmit={create}>
            <div className="field"><label>Meeting title</label><input className="input" autoFocus maxLength={120} required placeholder="Product sync" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="actions"><button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create & enter"}</button><button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button></div>
          </form>}
        </section>

        <section className="meeting-card">
          <div className="icon-box"><ArrowRight size={18} /></div>
          <h2 style={{ marginTop: 14 }}>Join a meeting</h2>
          <p className="muted">Paste the public meeting code or full meeting path.</p>
          <form className="form" onSubmit={join}>
            <input className="input" placeholder="j2g-k2w-aif" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <button className="button secondary" disabled={busy}>Join meeting <ArrowRight size={16} /></button>
          </form>
        </section>
      </div>

      <section style={{ marginTop: 30 }}>
        <div className="meeting-row"><div><h2>Recent meetings</h2><p className="muted" style={{ margin: "5px 0 0" }}>Your rooms stay available here.</p></div><span className="badge">{meetings.length} total</span></div>
        {meetings.length === 0 ? <div className="meeting-card dashboard-empty" style={{ marginTop: 14 }}><Video size={24} /><p className="muted">No meetings yet. Your first room will appear here.</p></div> : meetings.map((meeting) => <div className="meeting-card meeting-list-item" key={meeting.id}><div className="meeting-row"><div className="meeting-list-main"><div className="meeting-title">{meeting.title}</div><div className="meeting-meta">/meeting/{meeting.public_slug}</div></div><div className="actions" style={{ marginTop: 0 }}><span className="badge">{meeting.status}</span><Link className="button secondary" to="/meeting/$meetingSlug" params={{ meetingSlug: meeting.public_slug }}>Open <ArrowRight size={15} /></Link></div></div></div>)}
      </section>
    </main>
  </div>;
}
