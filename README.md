# Clear Meet

# BUILD A NEW PRODUCTION VIDEO CONFERENCING PLATFORM

Create a **completely new full-stack video conferencing web application** from scratch.

Build the actual working product, not a mockup or prototype.

The product should feel like a polished, modern alternative to Google Meet, with a **white/light theme**.

IMPORTANT:

* Build the complete foundation in one coherent architecture.
* Do not create fake/demo functionality.
* Do not use mock video participants.
* Do not use placeholder database logic for core features.
* Do not use unnecessary libraries.
* Keep the implementation clean and production-oriented.
* Avoid duplicate components/files.
* Prefer simple, maintainable code.
* Use Supabase for all application backend functionality.
* Use VideoSDK.live ONLY for video conferencing.

---

# 1. TECHNOLOGY STACK

## Frontend

Use:

* React
* TypeScript
* React Router
* Tailwind CSS
* Lucide React
* Framer Motion only where useful
* Supabase JavaScript client
* Official VideoSDK.live Web SDK

## Backend

Use Supabase:

* Supabase Auth
* PostgreSQL
* Row Level Security
* Edge Functions
* Realtime
* Storage

## Video

Use:

**VideoSDK.live ONLY**

Do NOT use:

* Daily
* Agora
* Twilio
* Jitsi
* Zoom
* Any other video provider

---

# 2. ARCHITECTURE

Use this architecture:

```text
                    React Frontend
                         │
             ┌───────────┴───────────┐
             │                       │
       Supabase Auth          VideoSDK.live
             │                       │
             ↓                       │
      Supabase Backend               │
      ├── PostgreSQL                 │
      ├── RLS                        │
      ├── Realtime                   │
      ├── Storage                    │
      └── Edge Functions ────────────┘
```

Responsibilities:

### Supabase

* Authentication
* User profiles
* Avatar storage
* Meetings
* Participants
* Waiting room
* Permissions
* Meeting chat
* Meeting history
* Realtime application state
* Secure VideoSDK token generation

### VideoSDK.live

* Audio
* Video
* Microphone
* Camera
* Screen sharing
* Video participants
* Media streams
* Active speaker
* Real-time media communication

---

# 3. WHITE LIGHT UI

The entire application must use a polished white/light theme.

Use:

* White backgrounds
* Light gray surfaces
* Dark text
* Subtle borders
* Soft shadows
* Rounded cards
* Blue/indigo primary actions
* Clean typography
* Professional spacing

Do NOT make the main UI dark.

The meeting interface should be visually inspired by Google Meet but have its own clean design.

---

# 4. ROUTES

Create:

```text
/
 /login
 /signup
 /forgot-password
 /dashboard
 /meetings
 /settings
 /profile
 /meeting/:meetingSlug
```

Public meeting links must use:

```text
/meeting/:meetingSlug
```

---

# 5. AUTHENTICATION

Use Supabase Auth.

Implement:

* Signup
* Login
* Logout
* Forgot password
* Password reset
* Persistent session
* Protected routes

Use the authenticated Supabase user ID as the source of identity.

Never allow the frontend to choose another user's identity.

---

# 6. USER PROFILE

Create a `profiles` table connected to:

```text
auth.users(id)
```

Fields:

```text
id UUID PRIMARY KEY
display_name TEXT
avatar_url TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Create a profile automatically when a user registers.

---

# 7. PROFILE AVATAR — SUPABASE STORAGE

Create a Supabase Storage bucket:

```text
avatars
```

Use Supabase Storage for profile images.

Do NOT store image files inside PostgreSQL.

Recommended path:

```text
avatars/{user_id}/profile.webp
```

Support:

* JPEG
* PNG
* WebP

Validate:

* File type
* File size
* User ownership

A user can only:

* Upload their own avatar
* Replace their own avatar
* Delete their own avatar

Create secure Storage policies.

Store only the avatar URL/path in:

```text
profiles.avatar_url
```

---

# 8. PROFILE PAGE

Create a polished profile page:

```text
Profile

        [ Avatar ]

     Change photo

Display name
[________________]

Email
user@example.com

[Save changes]
```

After upload:

* Save avatar to Supabase Storage.
* Update `profiles.avatar_url`.
* Refresh avatar everywhere automatically.

If no avatar exists, show initials.

---

# 9. AVATAR EVERYWHERE

Use the actual profile avatar and display name in:

* Navbar
* Dashboard
* Profile
* Waiting room
* Participant list
* Video tiles
* Meeting chat
* Meeting history

Never hard-code user names or avatars.

---

# 10. DATABASE FILE

Create exactly:

```text
supabase/schema.sql
```

This must be the complete initial database schema.

Include:

* Extensions
* Enums
* Tables
* Foreign keys
* Constraints
* Indexes
* Triggers
* Functions
* RLS
* RLS policies

The schema must be suitable for a fresh Supabase project.

---

# 11. MEETINGS TABLE

Create:

```text
meetings
```

with:

```text
id UUID PRIMARY KEY
host_id UUID REFERENCES profiles(id)
title TEXT NOT NULL
public_slug TEXT UNIQUE NOT NULL
videosdk_meeting_id TEXT
status meeting_status
created_at TIMESTAMPTZ
started_at TIMESTAMPTZ
ended_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Add indexes.

---

# 12. MEETING STATUS

Create enum:

```text
scheduled
active
ended
cancelled
```

---

# 13. PARTICIPANT TABLE

Create:

```text
meeting_participants
```

with:

```text
id UUID PRIMARY KEY
meeting_id UUID REFERENCES meetings(id)
user_id UUID REFERENCES profiles(id)
role participant_role
status participant_status
joined_at TIMESTAMPTZ
admitted_at TIMESTAMPTZ
left_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
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

Add indexes for:

```text
meeting_id
user_id
status
```

---

# 14. MEETING CHAT TABLE

Create:

```text
meeting_messages
```

with:

```text
id UUID PRIMARY KEY
meeting_id UUID REFERENCES meetings(id)
sender_id UUID REFERENCES profiles(id)
message TEXT NOT NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Never trust a client-provided `sender_id`.

The sender must always be the authenticated user.

---

# 15. MEETING EVENTS

Create:

```text
meeting_events
```

with:

```text
id UUID PRIMARY KEY
meeting_id UUID REFERENCES meetings(id)
actor_user_id UUID REFERENCES profiles(id)
event_type TEXT NOT NULL
target_user_id UUID REFERENCES profiles(id)
metadata JSONB
created_at TIMESTAMPTZ
```

Use it for application events such as:

```text
meeting_created
meeting_started
participant_joined
participant_requested
participant_admitted
participant_rejected
participant_removed
participant_left
meeting_ended
```

Do NOT store audio/video data here.

---

# 16. SECURE MEETING LINKS

Never use sequential public meeting IDs.

Do NOT create:

```text
/meeting/1
/meeting/123
/meeting/12345
```

Create secure random public slugs:

```text
/meeting/asd-shay-mdj
/meeting/k7p-x92-mqa
/meeting/qwe-rty-uio
```

Generate the slug using cryptographically secure randomness.

Example:

```text
https://mywebsite.com/meeting/asd-shay-mdj
```

Internally:

```text
public_slug
      ↓
meeting UUID
      ↓
videosdk_meeting_id
```

The public slug identifies the meeting but is NOT authorization.

---

# 17. CREATE MEETING

Authenticated user clicks:

```text
+ Create Meeting
```

Show:

```text
Meeting title
[________________]

[Create meeting]
```

On creation:

1. Verify authenticated user.
2. Validate title.
3. Generate secure random slug.
4. Create VideoSDK.live meeting.
5. Store VideoSDK meeting ID.
6. Create meeting record.
7. Create host participant.
8. Set role = `host`.
9. Set status = `admitted`.
10. Set meeting active when host enters.
11. Open meeting.

The creator is automatically the host.

The host does NOT enter the waiting room.

---

# 18. VIDEOSDK.LIVE

Use the official VideoSDK.live Web SDK.

Use real:

* Meeting
* Participant
* Audio
* Video
* Camera
* Microphone
* Screen sharing
* Active speaker
* Leave

Do NOT create fake video tiles or mock media.

---

# 19. VIDEOSDK SECURITY

Never expose the VideoSDK.live secret in React.

Use Supabase Edge Functions.

Flow:

```text
React
 ↓
Authenticated Supabase Edge Function
 ↓
Verify user
 ↓
Verify meeting
 ↓
Verify participant permissions
 ↓
Generate appropriate VideoSDK.live credential
 ↓
Return short-lived credential
 ↓
VideoSDK.live Web SDK
```

Store private VideoSDK credentials only in Supabase Edge Function secrets.

Never expose:

```text
VIDEOSDK_API_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

to the frontend.

---

# 20. EDGE FUNCTIONS

Create:

```text
supabase/functions/
├── create-meeting/
├── join-meeting/
├── create-video-token/
├── admit-participant/
├── reject-participant/
├── remove-participant/
└── end-meeting/
```

Each function must:

* Authenticate
* Validate input
* Authorize operation
* Perform operation
* Return safe data
* Handle errors

If multiple operations can safely share an existing function, avoid unnecessary duplicate functions.

---

# 21. UNAUTHENTICATED MEETING VISITOR

If someone opens:

```text
/meeting/asd-shay-mdj
```

while logged out:

```text
You've been invited to a meeting

Meeting Name

Sign in or create an account to continue.

[Sign in]
[Create account]
```

After successful login/signup:

```text
Login
 ↓
Restore meeting destination
 ↓
/meeting/asd-shay-mdj
```

Do not require the user to paste the meeting link again.

---

# 22. WAITING ROOM

A participant who has not been admitted must enter:

```text
You're in the waiting room

Waiting for the host to let you in...
```

Show:

* Avatar
* Name
* Camera preview where supported
* Connection status
* Leave button

Before admission:

```text
Microphone = disabled
Camera publishing = disabled
Screen sharing = disabled
```

The restriction must be enforced by the actual VideoSDK.live permission/token/session architecture.

Do NOT rely only on disabled React buttons.

---

# 23. HOST WAITING LIST

Host sees:

```text
People

IN MEETING

[Avatar] You
[Avatar] John Smith
[Avatar] Sarah Ahmed

WAITING

[Avatar] David Khan
[Admit] [Remove]

[Avatar] Michael
[Admit] [Remove]
```

Use Supabase Realtime so admission changes immediately appear.

---

# 24. ADMIT

When host clicks:

```text
Admit
```

verify server-side:

```text
authenticated user
+
meeting
+
host/co-host permission
+
target participant
```

Then:

```text
waiting
```

becomes:

```text
admitted
```

Update participant in real time.

Then allow the participant to enter the active VideoSDK.live session with the correct media permissions.

---

# 25. REMOVE / REJECT

Host/co-host can:

```text
Reject
Remove
```

participants.

These operations must be server-authorized.

Removed participant sees:

```text
You were removed from the meeting.
```

---

# 26. GOOGLE MEET–STYLE VIDEO UI

Create a professional meeting screen:

```text
┌──────────────────────────────────────────────┐
│ Meeting Name                         12:45   │
├──────────────────────────────────────────────┤
│                                              │
│              VIDEO GRID                      │
│                                              │
│   ┌────────────┐     ┌────────────┐         │
│   │            │     │            │         │
│   │ Participant│     │ Participant│         │
│   │            │     │            │         │
│   └────────────┘     └────────────┘         │
│                                              │
├──────────────────────────────────────────────┤
│ Mic | Camera | Share | People | Chat | More │
│                                   [Leave]    │
└──────────────────────────────────────────────┘
```

Use responsive layouts.

---

# 27. VIDEO TILES

Each real participant tile shows:

* VideoSDK.live stream
* Display name
* Avatar when camera is off
* Mic state
* Camera state
* Active speaker indication where supported

Camera-off example:

```text
[Avatar]

John Smith
```

---

# 28. MEETING CONTROLS

Provide:

```text
Microphone
Camera
Screen Share
People
Chat
More
Leave
```

Host additionally:

```text
End Meeting
```

All buttons must perform real functionality.

---

# 29. MEETING CHAT

Add a real-time messaging panel.

Desktop:

```text
┌─────────────────────────────┐
│ Chat                    ×   │
├─────────────────────────────┤
│                             │
│ [Avatar] John Smith         │
│ Hello everyone!             │
│ 12:42                       │
│                             │
│       [Avatar] You          │
│       Hello John            │
│       12:43                 │
│                             │
├─────────────────────────────┤
│ Message...              ➤   │
└─────────────────────────────┘
```

Mobile:

* Open chat as a drawer/sheet.
* Do not cover the entire application unnecessarily.

---

# 30. CHAT FEATURES

Implement:

* Real-time messages
* Sender avatar
* Sender display name
* Message
* Timestamp
* Auto-scroll
* Enter to send
* Shift+Enter for newline
* Sending state
* Error state
* Empty state

Use Supabase Realtime.

Only authorized meeting participants can read/send messages.

Do not allow users to impersonate another sender.

Limit message length.

Never render messages as unsafe HTML.

---

# 31. PARTICIPANT PANEL

Create a People panel showing:

```text
People (8)

IN MEETING

[Avatar] You
[Avatar] John Smith
[Avatar] Sarah Ahmed

WAITING

[Avatar] David Khan
[Admit] [Remove]
```

Display:

* Avatar
* Display name
* Role where appropriate
* Mic state
* Camera state
* Waiting/admitted status

---

# 32. HOST CONTROLS

Host can:

* Admit participants
* Reject participants
* Remove participants
* Mute participants where supported
* View participant list
* Copy meeting link
* Screen share
* End meeting

All privileged operations must be server-authorized.

---

# 33. PARTICIPANT CONTROLS

Admitted participants can:

* Toggle microphone
* Toggle camera
* Screen share
* View participants
* Open chat
* Leave meeting

Waiting participants cannot actively publish:

* Microphone
* Camera
* Screen share

---

# 34. END MEETING

Host can select:

```text
End meeting
```

Show confirmation:

```text
End this meeting?

Everyone will be disconnected.

[Cancel] [End meeting]
```

When confirmed:

1. Verify host.
2. Mark meeting ended.
3. Update participant states.
4. End VideoSDK.live meeting/session as appropriate.
5. Notify participants.
6. Disconnect participants.
7. Show ended screen.

Ended meeting:

```text
This meeting has ended.
```

---

# 35. REALTIME

Use Supabase Realtime for:

* Waiting room
* Admission
* Participant application state
* Meeting status
* Meeting chat

Use VideoSDK.live for:

* Video
* Audio
* Screen share
* Media state
* Active speaker

Do not duplicate media infrastructure in Supabase.

---

# 36. RLS SECURITY

Enable RLS on all private tables.

Protect:

* Profiles
* Meetings
* Participants
* Messages
* Events

Users must only access data they are authorized to access.

Hosts/co-hosts can manage their meetings.

Participants can access only meetings they belong to.

Never use insecure policies such as:

```sql
USING (true)
```

for private meeting data.

Never trust frontend role/status values.

---

# 37. INPUT VALIDATION

Validate:

### Meeting title

* Required
* Trimmed
* Reasonable maximum length

### Display name

* Required
* Trimmed
* Reasonable maximum length

### Chat message

* Required
* Trimmed
* Reasonable maximum length

Prevent XSS and unsafe HTML rendering.

---

# 38. ERROR STATES

Implement clean UI for:

### Invalid meeting

```text
Meeting not found

This meeting link may be invalid or expired.
```

### Ended meeting

```text
This meeting has ended.
```

### Unauthorized

```text
You don't have permission to access this meeting.
```

### Waiting

```text
Waiting for the host...
```

### Connection problem

```text
Connection lost

Trying to reconnect...
```

Never display SQL errors, stack traces, internal IDs, or secrets.

---

# 39. DASHBOARD

Create a clean dashboard:

```text
Good afternoon

[ + New Meeting ]

Upcoming
Active
Recent Meetings
```

Meeting cards show:

* Title
* Date
* Host
* Status
* Participant count
* Join
* Copy link
* More

---

# 40. MEETING HISTORY

Create:

```text
/meetings
```

Show authorized meetings.

Display:

* Meeting name
* Date
* Duration
* Host
* Participant count
* Status

Only show meetings the current user is authorized to see.

---

# 41. SETTINGS

Create a simple settings page for:

* Profile
* Account
* Avatar
* Display name

Do not add unnecessary settings.

---

# 42. RESPONSIVE DESIGN

Support:

* Desktop
* Laptop
* Tablet
* Mobile

Desktop:

```text
Video grid + optional side panel
```

Mobile:

```text
Video grid
Bottom controls
Chat drawer
People drawer
```

Controls must remain accessible.

---

# 43. PERFORMANCE

Use:

* Lazy loading for heavy meeting components
* Efficient React rendering
* Database indexes
* Realtime subscriptions only where needed
* Proper cleanup

When leaving a meeting:

* Clean up VideoSDK session
* Clean up media
* Remove Realtime subscriptions
* Remove event listeners

Avoid memory leaks.

---

# 44. ENVIRONMENT VARIABLES

Create:

```text
.env.example
```

Use public frontend values only where appropriate.

Example:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VIDEOSDK_API_KEY=
VIDEOSDK_API_SECRET=
```

IMPORTANT:

Do NOT expose `VIDEOSDK_API_SECRET` through frontend code.

If VideoSDK requires different credentials/configuration, use the exact official variable names required by the implementation.

Private secrets must exist only in Supabase Edge Function secrets.

---

# 45. PROJECT STRUCTURE

Use:

```text
project/
│
├── src/
│   ├── components/
│   │   ├── meeting/
│   │   ├── chat/
│   │   ├── participants/
│   │   ├── profile/
│   │   └── ui/
│   │
│   ├── pages/
│   ├── layouts/
│   ├── hooks/
│   ├── services/
│   ├── contexts/
│   ├── lib/
│   ├── types/
│   └── App.tsx
│
├── supabase/
│   ├── schema.sql
│   └── functions/
│       ├── create-meeting/
│       ├── join-meeting/
│       ├── create-video-token/
│       ├── admit-participant/
│       ├── reject-participant/
│       ├── remove-participant/
│       └── end-meeting/
│
├── public/
├── .env.example
├── package.json
└── README.md
```

Keep the structure simple. Do not create unnecessary files.

---

# 46. README

Create `README.md` containing:

* Project overview
* Architecture
* Supabase setup
* How to run `schema.sql`
* Auth setup
* Storage/avatar setup
* Realtime setup
* Edge Functions
* VideoSDK.live setup
* Required secrets
* Local development
* Production deployment
* Security model
* Meeting flow

Never put real secrets into README.

---

# 47. FINAL SECURITY MODEL

The following must ALWAYS be true:

```text
Knowing meeting URL
        ≠
Full meeting permission
```

Authorization requires:

```text
Authenticated user
+
Valid meeting
+
Valid participant state
+
Correct role
```

Waiting user:

```text
Can see waiting room
Cannot publish microphone
Cannot publish camera
Cannot screen share
```

Admitted user:

```text
Can use permitted meeting media
```

Host:

```text
Can manage participants
Can admit
Can remove
Can end meeting
```

---

# 48. FINAL BUILD REQUIREMENT

Build the complete application, not just the UI.

The final project must have REAL:

* Supabase Auth
* PostgreSQL
* `supabase/schema.sql`
* RLS
* Supabase Storage
* Avatar upload
* Profile system
* Supabase Realtime
* Edge Functions
* VideoSDK.live
* Secure meeting URLs
* Meeting creation
* Host role
* Waiting room
* Host admission
* Participant removal
* Microphone
* Camera
* Screen sharing
* Video tiles
* Participant list
* Meeting chat
* Chat persistence
* Meeting history
* Meeting lifecycle
* End meeting
* Responsive white/light UI

Do not use fake data for core functionality.

Do not use fake video.

Do not expose secrets.

Do not use another video provider.

---

# 49. BUILD EFFICIENCY RULE

Because this is a new project, implement the foundation in a logical order:

```text
1. Project structure
2. Supabase Auth
3. schema.sql + RLS
4. Supabase Storage/avatar
5. Dashboard
6. Secure meeting creation
7. VideoSDK.live integration
8. Waiting room
9. Host admission
10. Meeting UI
11. Participant management
12. Meeting chat + Realtime
13. Meeting history
14. Security/error handling
15. Final testing
```

Do not repeatedly rebuild the same feature.

Before creating a new component, check whether an existing component can be reused.

Before creating a new database table, check whether an existing table already covers the requirement.

Keep the implementation minimal, clean, secure, and production-ready.

# END OF BUILD PROMPT

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4d246336-a2b2-49e1-974e-4d4c9426b686).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
