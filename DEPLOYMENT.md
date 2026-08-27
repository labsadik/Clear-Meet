# Clear Meet deployment

## 1. Local web app

Use Node.js 22.12+ because this project uses Vite 8. Run:

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## 2. Supabase

Apply the migrations in `supabase/migrations/` or run the complete `supabase/schema.sql` on a fresh project. The migrations create the profiles, meetings, participants, chat, events, RLS, realtime configuration, and avatar bucket.

Deploy the Edge Functions under `supabase/functions/`.

Set these Supabase Edge Function secrets:

- `VIDEOSDK_API_KEY`
- `VIDEOSDK_SECRET`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase in deployed Edge Functions. Never expose the service role key or VideoSDK secret in a `VITE_*` variable.

## 3. VideoSDK

Create a VideoSDK account and API key/secret. Clear Meet creates real rooms server-side and mints short-lived role-aware JWTs for admitted participants. The browser never receives the VideoSDK secret.

## 4. Auth

In Supabase Authentication, configure the production Site URL and redirect URLs for the deployed Clear Meet domain. Enable email/password authentication.

## 5. Production verification

Run:

```bash
npm run lint
npm run build
```

Then test this flow with two real accounts and two browser profiles:

1. Sign up account A.
2. Create a meeting.
3. Copy `/meeting/<slug>`.
4. Sign in as account B and open the link.
5. Confirm B enters the waiting room.
6. Admit B from A.
7. Confirm real camera/microphone media appears for both users.
8. Test mute, camera, screen share and chat.
9. End the meeting as A and confirm later joins are rejected.

## Security note

A previous `.env` file was tracked in the repository. It has been removed from the repaired branch and `.env` is now ignored. If that historical file contained real credentials, rotate those credentials in Supabase and VideoSDK; deleting the current file does not revoke secrets that were previously committed.
