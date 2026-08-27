import { SignJWT } from "jose";

const API_BASE = "https://api.videosdk.live/v2";

function creds() {
  const apiKey = process.env["VIDEOSDK_API_KEY"];
  const apiSecret = process.env["VIDEOSDK_API_SECRET"];
  if (!apiKey || !apiSecret) {
    throw new Error("Video service is not configured.");
  }
  return { apiKey, apiSecret };
}

type TokenKind = "api" | "participant";

/**
 * Short-lived VideoSDK credential.
 * - "api": server-to-server (room creation / deactivation), never sent to the browser.
 * - "participant": scoped to a single room + participant, allows joining and publishing.
 */
export async function signVideoToken(options: {
  kind: TokenKind;
  roomId?: string;
  participantId?: string;
  ttlSeconds?: number;
}): Promise<string> {
  const { apiKey, apiSecret } = creds();
  const secret = new TextEncoder().encode(apiSecret);

  const payload: Record<string, unknown> = {
    apikey: apiKey,
    permissions: ["allow_join"],
    version: 2,
    roles: ["rtc"],
  };

  if (options.kind === "api") {
    payload["permissions"] = ["allow_join", "allow_mod"];
  } else {
    if (options.roomId) payload["roomId"] = options.roomId;
    if (options.participantId) payload["participantId"] = options.participantId;
  }

  const ttl = options.ttlSeconds ?? (options.kind === "api" ? 120 : 60 * 60 * 4);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secret);
}

export async function createVideoRoom(): Promise<string> {
  const token = await signVideoToken({ kind: "api" });
  const res = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    console.error("[videosdk] create room failed", res.status, await res.text());
    throw new Error("Could not create the video room. Please try again.");
  }
  const json = (await res.json()) as { roomId?: string };
  if (!json.roomId) throw new Error("Could not create the video room. Please try again.");
  return json.roomId;
}

export async function deactivateVideoRoom(roomId: string): Promise<void> {
  try {
    const token = await signVideoToken({ kind: "api" });
    await fetch(`${API_BASE}/rooms/deactivate`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
  } catch (error) {
    console.error("[videosdk] deactivate failed", error);
  }
}
