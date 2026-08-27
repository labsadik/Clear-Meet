import { SignJWT } from "https://esm.sh/jose@6";

async function authToken(permissions: string[]) {
  const apiKey = Deno.env.get("VIDEOSDK_API_KEY");
  const secret = Deno.env.get("VIDEOSDK_SECRET");
  if (!apiKey || !secret) throw new Error("VideoSDK server credentials are not configured");
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({ apikey: apiKey, permissions })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

export async function createRoom() {
  const token = await authToken(["allow_join", "allow_mod"]);
  const response = await fetch("https://api.videosdk.live/v2/rooms", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({}) });
  const payload = await response.json();
  if (!response.ok || !payload.roomId) throw new Error(payload.message || "VideoSDK room creation failed");
  return payload.roomId as string;
}

export async function createParticipantToken(permissions: string[]) {
  return authToken(permissions);
}
