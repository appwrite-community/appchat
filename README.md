# AppChat

AppChat is a Snapchat-inspired demo app built with Appwrite and TanStack Start. It pairs live friend locations, realtime snap notifications, friend requests, and 24-hour photo delivery through an Appwrite Function.

This repository accompanies the Appwrite blog post:

https://appwrite.io/blog/post/building-snapchat-clone-with-presences-and-realtime

## What it demonstrates

- Appwrite Auth for email/password sign in and registration
- Appwrite Presences for live user location pins
- Appwrite TablesDB for friend requests, friendships, and snap metadata
- Appwrite Storage for snap image files
- Appwrite Functions for permission-checked, 24-hour snap delivery
- Appwrite Realtime channel helpers for inbox updates and app-wide snap toasts
- TanStack Start server functions for privileged Appwrite operations

## Project structure

```txt
appwrite.config.json          Appwrite Site and Function configuration
functions/serve-snap/         HTTP function that serves snap bytes after checks
src/lib/appwrite/             Appwrite clients and server functions
src/routes/                   TanStack Start routes for auth, map, friends, inbox, and send
src/components/SnapGlobe.tsx  Globe UI for live presence pins
```

## Prerequisites

- Node.js 20+
- pnpm
- Appwrite CLI
- An Appwrite project

## Configure Appwrite

Create an Appwrite project and use `appwrite.config.json` as the deployment config. The app expects these resource IDs:

- Project: `appchat-demo`
- Database: `appchat-db`
- Tables: `snaps`, `friendRequests`, `friendships`
- Bucket: `snaps`
- Function: `serve-snap`
- Site: `appchat-web`

Set a server-side API key for local SSR/admin operations:

```bash
cp .env.example .env
```

Then fill in `APPWRITE_API_KEY` with a key that can read users, read/write rows, and write presences. For deployed Appwrite Sites, add the same value as a Site environment variable.

## Run locally

```bash
pnpm install
pnpm dev
```

The app runs on http://localhost:3000.

## Deploy

```bash
appwrite --all push tables
appwrite --all push buckets
appwrite push functions --function-id serve-snap --activate
appwrite push sites --site-id appchat-web --activate
```

The config deploys the TablesDB schema, Storage bucket, TanStack Start site, and the `serve-snap` function.

For demos, `APPWRITE_API_KEY=... pnpm seed:appwrite` creates Alice and Bob, makes them friends, and drops initial presence pins.

## Scripts

```bash
pnpm lint
pnpm test
pnpm build
pnpm check
pnpm seed:appwrite
```
