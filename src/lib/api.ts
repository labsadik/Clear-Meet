import { supabase } from "@/integrations/supabase/client";

export async function invoke<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Please sign in first.");
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error.message || `Request to ${name} failed`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type Profile = { id: string; display_name: string; avatar_url: string | null };
export type Meeting = {
  id: string;
  host_id: string;
  title: string;
  public_slug: string;
  videosdk_meeting_id: string | null;
  status: "scheduled" | "active" | "ended" | "cancelled";
  created_at: string;
};

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from("profiles").select("id,display_name,avatar_url").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
