# Clear Meet

Clear Meet is a full-stack browser video-conferencing application for creating and joining secure meetings. It includes authenticated accounts, shareable meeting links, waiting rooms, host moderation, live audio/video, screen sharing, active-speaker feedback, in-call chat, profiles, meeting history, and creator-controlled meeting deletion.

## Technology

- React 19 + TypeScript
- TanStack Start / TanStack Router
- Vite
- Tailwind CSS
- Supabase Auth, PostgreSQL, RLS, Realtime, Storage, Edge Functions
- VideoSDK.live as the only realtime media provider
- Lucide React for interface icons

Supabase owns application identity, data, authorization, storage, realtime application state, and protected server operations. VideoSDK.live owns realtime audio/video/media transport.

## Product flow

```text
Sign in / Sign up
      ↓
Dashboard
      ↓
Create meeting or open a meeting link
      ↓
Server verifies the user and meeting access
      ↓
Waiting room when admission is required
      ↓
Host admits participant
      ↓
Secure VideoSDK session
      ↓
Meeting room
  ├─ microphone
  ├─ camera
  ├─ screen sharing
  ├─ participants
  ├─ active speaker
  ├─ chat
  └─ host controls
      ↓
Leave / meeting ends
      ↓
Meeting history
```

A public slug identifies a meeting but does not grant access. Authorization always comes from the authenticated Supabase user and server-side participant checks.

## Features

### Accounts and profiles

- Email/password authentication.
- Persistent Supabase sessions.
- Login, signup, logout, and password recovery.
- Editable display name.
- Avatar upload and replacement through Supabase Storage.
- Profile information reused in the dashboard, waiting room, participant cards, chat, and account UI.

### Meetings

- Create a meeting with a title.
- Secure random meeting slugs such as `j2g-k2w-aif`.
- Public links at `/meeting/:meetingSlug`.
- Host is automatically admitted.
- Non-host participants can wait for admission.
- Host/co-host admission, rejection, and removal.
- Meeting history.
- Meeting creator can delete their own meeting.

### Live meetings

- Real participant audio and video.
- Independent microphone and camera controls.
- Screen sharing and screen-share audio when provided by the browser/SDK.
- Presenter identification.
- Participant filmstrip while a screen is shared.
- Active-speaker visual feedback.
- In-call chat and people panels.
- Responsive meeting controls.
- White/light glass visual theme.

Joining the meeting is intentionally independent from microphone/camera permission. Users can enter with both devices off and enable either device later.

## Architecture

```text
┌──────────────────────── Browser ────────────────────────┐
│ React / TanStack Start                                  │
│                                                        │
│ Routes → Auth UI → Dashboard → Profile → Meeting UI    │
│            │                              │             │
│            │ Supabase JS                  │ VideoSDK    │
└────────────┼──────────────────────────────┼─────────────┘
             ↓                              ↓
      ┌───────────────┐             ┌────────────────┐
      │   Supabase    │             │ VideoSDK.live  │
      │               │             │                │
      │ Auth          │             │ Audio          │
      │ PostgreSQL    │             │ Video          │
      │ RLS           │             │ Participants   │
      │ Realtime      │             │ Screen share   │
      │ Storage       │             │ Media streams  │
      │ Edge Functions│             │ Active speaker │
      └───────┬───────┘             └────────────────┘
              │
              ↓
       Protected server logic
```

Raw audio/video is not stored in PostgreSQL.

## Repository structure

```text
bright-meet-spark/
├── public/
├── src/
│   ├── components/
│   │   ├── meeting/
│   │   └── ui/
│   ├── integrations/
│   │   └── supabase/
│   ├── lib/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── dashboard.tsx
│   │   ├── profile.tsx
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── meeting.$meetingSlug.tsx
│   ├── client.tsx
│   ├── router.tsx
│   ├── server.ts
│   └── styles.css
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   ├── create-meeting/
│   │   ├── create-video-token/
│   │   ├── join-meeting/
│   │   ├── admit-participant/
│   │   ├── reject-participant/
│   │   ├── remove-participant/
│   │   ├── leave-meeting/
│   │   ├── end-meeting/
│   │   └── delete-meeting/
│   └── migrations/
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Routes

```text
/                       Landing page
/login                  Sign in
/signup                 Create account
/forgot-password        Password recovery
/dashboard              Create, join, and manage meetings
/profile                Profile and avatar settings
/meeting/:meetingSlug   Meeting entry and live room
```

## Data model

### `profiles`

Application profile linked to the authenticated user:

```text
id
 display_name
 avatar_url
 created_at
 updated_at
```

### `meetings`

```text
id
host_id
title
public_slug
videosdk_meeting_id
status
created_at
started_at
ended_at
updated_at
```

Meeting status values:

```text
scheduled
active
ended
cancelled
```

### `meeting_participants`

```text
id
meeting_id
user_id
role
status
joined_at
admitted_at
left_at
created_at
updated_at
```

Roles:

```text
host
co_host
participant
```

Statuses:

```text
waiting
admitted
rejected
left
removed
```

### `meeting_messages`

```text
id
meeting_id
sender_id
message
created_at
updated_at
```

The authenticated server identity is authoritative for the sender.

### `meeting_events`

Stores lightweight application events such as meeting creation, admission, rejection, participant leave, and meeting end. Media is not stored here.

## Security

Protected operations run through authenticated Supabase Edge Functions. A typical request is:

```text
Browser
  ↓ Bearer Supabase session
Edge Function
  ↓ verify user
Database authorization
  ↓
Safe operation
```

VideoSDK credentials follow the same boundary:

```text
Browser
  ↓
create-video-token
  ↓ verify user + meeting + participant
create VideoSDK credential server-side
  ↓
Browser receives credential
  ↓
VideoSDK.live
```

Never expose or commit:

```text
SUPABASE_SERVICE_ROLE_KEY
VIDEOSDK_API_KEY
VIDEOSDK_SECRET
```

Client configuration contains only public Supabase values.

## Environment

Create `.env` from `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

VideoSDK credentials belong in Supabase Edge Function secrets:

```text
VIDEOSDK_API_KEY
VIDEOSDK_SECRET
```

Supabase normally injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into Edge Functions.

Do not put private credentials in `VITE_*` variables.

## Local setup

### Clone

```bash
git clone https://github.com/WorkRCS/bright-meet-spark.git
cd bright-meet-spark
```

### Install

```bash
npm install
```

### Configure Supabase

Create or select a Supabase project and deploy the database schema/migrations, RLS policies, Storage configuration, Realtime configuration, and Edge Functions.

Configure the VideoSDK secrets in the Supabase server environment.

### Run

```bash
npm run dev
```

The development server normally runs at:

```text
http://localhost:8080
```

### Validate

```bash
npm run lint
npm run build
npm run preview
```

## Meeting lifecycle

### Create meeting

`create-meeting` authenticates the user, validates the title, creates a VideoSDK room, generates a secure random slug, stores the room ID, creates the host participant, and returns the meeting.

### Open a meeting link

`join-meeting` resolves the public slug, validates lifecycle state, creates/restores the user's participant record, and places non-host users in the waiting state when admission is required.

### Admit participant

A host/co-host action is validated server-side. The participant changes from `waiting` to `admitted` and can then obtain a VideoSDK credential.

### Enter media room

`create-video-token` checks the authenticated participant and returns a server-generated VideoSDK credential plus the stored VideoSDK meeting ID. The browser-only meeting client then initializes VideoSDK.

The room can be entered with microphone and camera off. Each device can be enabled independently after entry.

## Screen sharing

The meeting layout separates presentation from people:

```text
┌──────────────────────────────────────────────┐
│              Alex is presenting              │
│                                              │
│                  shared screen               │
└──────────────────────────────────────────────┘
│ You │ Sam │ Priya │ Omar │ Alex │ …          │
```

The presenter is labeled, the other users remain visible in the filmstrip, and screen-share audio is attached when VideoSDK supplies it.

## Realtime behavior

Supabase Realtime handles application-level changes including participant admission/removal and new chat messages. VideoSDK handles realtime media.

The meeting UI avoids unnecessary full-history reloads for individual realtime updates to reduce network and React rendering work during calls.

## Profile and avatars

Avatar files use Supabase Storage. The database stores the avatar URL/path rather than image binary data. A profile's name and avatar are reflected throughout the product.

## Meeting deletion

The meeting creator can delete a meeting through the protected `delete-meeting` Edge Function. The server verifies the creator against `meetings.host_id` before deletion. Related application records follow the database foreign-key/cascade rules.

## Production deployment

A production environment needs:

1. The built TanStack Start application running on a compatible host/runtime.
2. Supabase with database, RLS, Storage, Realtime, Edge Functions, and server secrets configured.
3. A VideoSDK.live account with matching credentials stored only on the server.

Build with:

```bash
npm run build
```

Follow the hosting provider's TanStack Start/Vite server deployment instructions for the generated server output.

## Troubleshooting

### Supabase variables missing

Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then restart the dev server.

### `self is not defined`

Keep the VideoSDK runtime browser-only. Do not add a top-level VideoSDK runtime import to an SSR route.

### `INVALID_TOKEN`

Verify the server-side VideoSDK API key/secret and ensure the credential is generated for an admitted participant and the correct stored VideoSDK meeting ID.

### `ERROR_OPERATION_IN_PROGRESS`

Only one VideoSDK meeting provider/session should exist for a mounted meeting. Do not mount duplicate providers or trigger multiple joins for one room.

### Screen sharing missing

Check the participant's VideoSDK presenter state and `screenShareStream`. The UI should render the presenter stage and keep other participants in the filmstrip.

### Camera or microphone unavailable

The meeting should still be joinable with both devices off. Check browser permission only when enabling the corresponding device.

## Development principles

- Server authorization is authoritative.
- Public meeting codes are identifiers, not permissions.
- Private credentials never enter the frontend bundle.
- VideoSDK.live is the only media provider.
- Prefer real backend and media behavior over mock data.
- Keep VideoSDK code browser-only.
- Keep Realtime subscriptions scoped and avoid redundant queries.
- Keep the interface responsive and accessible.
- Run lint and production build before merging.

## License

No open-source license is currently declared for this repository. Until a license is added, all rights remain with the copyright holder.
