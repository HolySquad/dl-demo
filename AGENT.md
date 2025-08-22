AGENT.md — React + Liveblocks + Supabase

Purpose: This document instructs an autonomous coding agent how to scaffold, build, and maintain a real-time collaborative React application using Liveblocks for multiplayer presence/storage and Supabase for auth, data, and file storage. Follow this as the single source of truth.

1) Mission & Non-Goals

Mission

Build a production-ready React app where authenticated users can create/join workspaces and collaboratively edit “boards/documents” in real time (cursor presence, selections, comments, text/shape objects).

Store durable data (projects, documents, comments, user profiles) in Supabase (Postgres + RLS).

Use Liveblocks for low-latency presence and collaborative state (Room, Presence, LiveStorage).

Ship with tests, CI, type-safe APIs, and secure defaults.

Non-Goals

No server-rendered frameworks unless specified (default: Vite + React).

No proprietary design systems; use Tailwind/shadcn/ui if UI is needed.

No ad hoc backend outside Supabase Edge Functions (when required).

2) Tech Stack

Frontend: React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, React Router

Collaboration: Liveblocks (presence, Broadcast, LiveList/LiveMap, Room permissions)

Backend: Supabase (Auth, Postgres, Storage, Row Level Security), optional Edge Functions (Deno)

Data Access: supabase-js, Zod for runtime validation

Testing: Vitest, React Testing Library, Playwright (E2E)

Quality: ESLint, Prettier, TypeScript strict

CI: GitHub Actions (lint/test/build, preview deploys)

Deploy: Vercel (web), Supabase (db/auth/storage/functions)

3) Repo Layout
/ (root)
├─ apps/
│  └─ web/                    # React app (Vite)
│     ├─ src/
│     │  ├─ app/              # routes & pages
│     │  ├─ components/
│     │  ├─ features/         # domain features (boards, comments, presence)
│     │  ├─ liveblocks/       # room client, presence types, storage schemas
│     │  ├─ lib/              # supabase client, hooks, utils
│     │  ├─ stores/           # local state (Zustand if needed)
│     │  └─ types/
│     ├─ public/
│     └─ index.html
├─ packages/
│  └─ schema/                 # shared zod types, DTOs
├─ supabase/                  # migrations, policies, seed, edge functions
├─ .github/workflows/         # CI
├─ .env.example
└─ README.md


4) Environment Variables

Create .env.local in apps/web:
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

VITE_LIVEBLOCKS_PUBLIC_KEY=pk_live_xxx   # Liveblocks public (client) key

# Optional analytics / sentry
VITE_SENTRY_DSN=
Do not commit real secrets. Use Vercel envs for deploy.

5) Supabase: Database Schema & RLS

Tables (minimum)

profiles

id uuid primary key references auth.users(id)

username text unique

full_name text

avatar_url text

created_at timestamptz default now()

workspaces

id uuid primary key default gen_random_uuid()

name text not null

owner_id uuid references auth.users(id) not null

created_at timestamptz default now()

workspace_members

workspace_id uuid references workspaces(id) on delete cascade

user_id uuid references auth.users(id) on delete cascade

role text check (role in ('owner','editor','viewer')) default 'editor'

joined_at timestamptz default now()

PK (workspace_id, user_id)

documents

id uuid primary key default gen_random_uuid()

workspace_id uuid references workspaces(id) on delete cascade

title text not null

liveblocks_room_id text unique not null

created_by uuid references auth.users(id)

created_at timestamptz default now()

updated_at timestamptz default now()

comments

id uuid primary key default gen_random_uuid()

document_id uuid references documents(id) on delete cascade

author_id uuid references auth.users(id)

body text not null

selection jsonb -- anchor/target data

created_at timestamptz default now()

RLS (Row Level Security)
Enable RLS on all tables and add policies:

profiles:

Select: auth.uid() = id OR user is member of any shared workspace with profile owner (optional).

Upsert self: auth.uid() = id.

workspaces:

Select/Insert: auth.uid() is not null.

Update/Delete: owner_id = auth.uid().

workspace_members:

Select: EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.user_id = auth.uid() AND wm.workspace_id = workspace_members.workspace_id).

Insert: owner or editor invites (check role of auth.uid() in target workspace).

Delete: owner or self.

documents:

Select/Insert/Update: user is member of the document’s workspace.

Delete: owner or editor depending on role policy.

comments:

Select: user is member of the parent document’s workspace.

Insert: same as Select.

Delete: author or workspace owner/editor.

Implement policies using using / with check expressions. Include SQL migrations in /supabase/migrations.

Storage Buckets (optional)

assets (RLS: members of workspace can read; editors/owners can write).

6) Supabase Auth

Use Supabase email/password and OAuth (GitHub/Google) as needed.

After sign-in, ensure profiles row exists (upsert on first session).

Expose a typed useSession() hook and a RequireAuth route guard.

7) Liveblocks Model

Presence (TypeScript)
export type Presence = {
  cursor?: { x: number; y: number } | null;
  selection?: string | null; // document node id
  color?: string;            // UI-only
  name?: string;             // from profile
};


Storage

Use LiveMap<string, LiveObject<Node>> for document nodes or LiveList<LiveObject<Block>> depending on the editor model.

Keep durable metadata (title, permissions) in Supabase; keep fast-changing state (positions, transient selections) in Liveblocks.

Permissions

Each documents.liveblocks_room_id maps to a Liveblocks room.

On Room creation, restrict access to members of workspace_id.
For server-side auth (recommended), use a Supabase Edge Function to sign Liveblocks auth requests after verifying user’s membership.

8) Data Flow & Architecture

Auth: User signs in via Supabase → profiles ensured.

Workspace & Documents: CRUD via Supabase (PostgREST through supabase-js) subject to RLS.

Join Room: Client requests Liveblocks auth token from /api/liveblocks-auth (Edge Function); server verifies auth.uid() is a member of workspace_id for the target document; returns signed token.

Realtime Editing: Client connects to Liveblocks Room; updates Presence (cursor), edits Storage; broadcast low-latency events.

Persistence: For durable content, periodically snapshot Liveblocks Storage into Supabase (optional) or store authoritative content updates via app logic (e.g., on “save” or throttled).

Comments: Stored in Supabase; optionally mirror ephemeral comment drafts in Liveblocks.

9) Frontend Pages (MVP)

/login — sign in/up

/ — user dashboard with workspaces & recent documents

/w/:workspaceId — workspace overview

/d/:documentId — collaborative editor page (joins Liveblocks room)

/settings/profile — profile & avatar

10) Key Implementations (Agent Tasks)


11) Example Code Stubs

Supabase client (apps/web/src/lib/supabase.ts)

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);


Liveblocks client (apps/web/src/liveblocks/client.ts)

import { createClient } from "@liveblocks/client";

export const liveblocks = createClient({
  publicApiKey: import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY!,
});


Room Hook (apps/web/src/liveblocks/useRoom.tsx)
import { createRoomContext } from "@liveblocks/react";
import type { Presence } from "../types/presence";

export const {
  RoomProvider,
  useOthers,
  useSelf,
  useUpdateMyPresence,
  useStorage,
  useMutation,
} = createRoomContext<Presence, any /* Storage */, {}>();


Edge Function (Supabase) supabase/functions/liveblocks-auth/index.ts (Deno)

// Pseudocode: verify Supabase JWT, check membership, return signed Liveblocks auth
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signLiveblocksAuth } from "./liveblocks.ts"; // implement using secret key (server-side)

serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } }
  });

  const { documentId } = await req.json();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // check membership by joining documents -> workspaces -> workspace_members
  const { data: membership } = await supabase
    .rpc("is_member_of_document", { p_user_id: user.id, p_document_id: documentId });
  if (!membership) return new Response("Forbidden", { status: 403 });

  const roomId = await getRoomIdForDocument(supabase, documentId); // query documents table
  const auth = signLiveblocksAuth(roomId, user.id);                 // server secret
  return new Response(JSON.stringify(auth), { headers: { "Content-Type": "application/json" }});
});


Create a Postgres is_member_of_document function for efficient checks, or inline SQL with joins.

12) UI/UX Guidelines

Display avatars & name tags near cursors.

Show participant list with live statuses.

Use optimistic UI for document title/rename.

Indicate connection state (connected/reconnecting).

Provide share modal: invite by email → adds workspace_members.

13) Testing Strategy

Unit (Vitest): utilities, presence reducers, role guards, room adapters.

Integration (RTL): auth flows, workspace/document CRUD screens.

E2E (Playwright): two browser contexts joining same document, cursors visible, edits sync.
Minimum required tests:
Auth redirect and session restoration

RLS denial (viewer cannot delete)
Two-client presence propagation
Storage mutation debounces and snapshotting (if implemented)

14) Security & Compliance

Enforce RLS on every table. No bypass in client.

Room access via server-signed Liveblocks tokens only.

Validate all inputs with Zod before mutating storage or calling functions.

Store minimal PII; allow profile deletion/export (stub if not required).

Rate-limit invite endpoints (Edge Function) with simple token bucket.

15) NPM Scripts (apps/web)

{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "vitest run",
    "test:ui": "vitest",
    "e2e": "playwright test"
  }
}


16) CI/CD (GitHub Actions)

On PR: install, lint, test, build.

On main merge: deploy preview to Vercel; run Supabase migrations on release tag (manual gate).

17) Performance Notes

Use suspense & route-level code splitting.

Avoid excessive LiveStorage writes; batch with useMutation and debounce where appropriate.

Memoize heavy components; virtualize long lists (comments).

Keep presence lightweight (avoid large objects).

18) Observability

Add simple logger for room events (connect/disconnect, storage errors).

Optional Sentry for error monitoring (mask user ids).

19) Backlog (Ordered)

Scaffolding: Vite+React+TS+Tailwind+ESLint+Prettier

Supabase auth & profile bootstrap

DB schema + RLS + seeds + is_member_of_document RPC

Workspace & members management UI

Document CRUD + liveblocks_room_id mapping

Edge Function: /liveblocks-auth (server-signed)

Liveblocks Room integration: Presence, cursors, selections

LiveStorage model for document blocks; basic editor

Comments linked to selections

Tests (unit → integration → E2E)

CI/CD + preview deploys

Perf pass & a11y sweep

20) Definition of Done (DoD)

All CRUD covered with RLS and tested.

Two concurrent browsers show live presence and synced edits.

Unauthorized access is blocked by both UI guards and RLS.

Lint/test/build pass in CI; app deployable on Vercel; envs documented.

README updated with setup and run instructions.

21) Quick Start (for Humans & Agents)

Create Supabase project, get URL & anon key.

Run SQL in /supabase/migrations to create tables, RLS, RPC.

Configure Liveblocks project & get public client key and server secret (for Edge Function).

Set .env.local in apps/web (see above).

pnpm i && pnpm -C apps/web dev (or npm/yarn equivalent).

Open / → sign in → create workspace → create document → collaborate!

22) Useful References (Conceptual)

Supabase: Auth, RLS, PostgREST, Storage, Edge Functions

Liveblocks: Rooms, Presence, Broadcast, LiveStorage, Auth endpoints

React: Suspense/Code splitting, state co-location, accessibility basics

End of AGENT.md