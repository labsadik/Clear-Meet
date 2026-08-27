import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ImagePlus, Loader2, UserRound } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, refreshProfile, loading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    setName(profile?.display_name || "");
    setPreview(profile?.avatar_url || null);
  }, [profile]);

  const save = async () => {
    if (!user) return;
    const displayName = name.trim() || "User";
    setBusy(true);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      await refreshProfile();
      setMessage("Profile saved.");
    }
    setBusy(false);
  };

  const upload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar must be smaller than 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use JPEG, PNG or WebP.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const path = `${user.id}/profile.webp`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setBusy(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    await refreshProfile();
    URL.revokeObjectURL(objectUrl);
    setMessage("Photo updated.");
    setBusy(false);
  };

  if (loading || !user) return null;

  const initials = (name.trim() || profile?.display_name || "U").slice(0, 1).toUpperCase();

  return <div className="page">
    <header className="nav profile-nav">
      <Link to="/dashboard" className="brand"><span className="logo"><UserRound size={17} /></span>Clear Meet</Link>
      <Link className="button secondary" to="/dashboard"><ArrowLeft size={15} />Dashboard</Link>
    </header>

    <main className="container profile-layout">
      <section className="profile-heading"><div className="eyebrow">ACCOUNT</div><h1>Profile</h1><p className="muted">Keep your name and meeting avatar up to date. Changes appear across your rooms.</p></section>
      <section className="profile-card">
        <div className="profile-photo-block">
          <div className="profile-avatar-wrap">{preview ? <img src={preview} alt="Profile" className="profile-avatar-large" /> : <div className="profile-avatar-large profile-avatar-fallback">{initials}</div>}{busy && <div className="profile-avatar-loading"><Loader2 size={18} className="spin" /></div>}</div>
          <div><h2>Profile photo</h2><p className="muted">JPEG, PNG or WebP up to 5 MB.</p><button className="button secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}><ImagePlus size={16} />Change photo</button><input ref={fileInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></div>
        </div>

        <div className="profile-divider" />
        <div className="form">
          <div className="field"><label>Display name</label><input className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></div>
          <div className="field"><label>Email</label><input className="input" value={user.email || ""} disabled /></div>
          {error && <div className="error">{error}</div>}
          {message && <div className="success"><Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} />{message}</div>}
          <div className="actions"><button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button><Link className="button secondary" to="/dashboard"><Camera size={15} />Back to dashboard</Link></div>
        </div>
      </section>
    </main>
  </div>;
}
