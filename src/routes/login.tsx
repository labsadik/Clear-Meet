import { FormEvent, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(""); const { error } = await supabase.auth.signInWithPassword({email,password}); setBusy(false); if(error){setError(error.message);return;} navigate({to:"/dashboard"}); };
  return <div className="center-page"><div className="card"><Link className="brand" to="/"><span className="logo">C</span>Clear Meet</Link><h1>Welcome back</h1><p className="muted">Sign in to create or join a meeting.</p><form className="form" onSubmit={submit}><div className="field"><label>Email</label><input className="input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div><div className="field"><label>Password</label><input className="input" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></div>{error&&<div className="error">{error}</div>}<button className="button primary" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form><p className="muted" style={{textAlign:"center",fontSize:14}}>New here? <Link to="/signup" style={{color:"#2563eb",fontWeight:700}}>Create an account</Link></p></div></div>;
}
