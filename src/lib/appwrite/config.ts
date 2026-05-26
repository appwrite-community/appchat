export const appwrite = {
  endpoint:
    import.meta.env.VITE_APPWRITE_ENDPOINT ??
    'https://fra.cloud.appwrite.io/v1',
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID ?? 'appchat-demo',
  databaseId: 'appchat-db',
  tables: {
    snaps: 'snaps',
    friendRequests: 'friendRequests',
    friendships: 'friendships',
  },
  buckets: {
    snaps: 'snaps',
  },
  functions: {
    serveSnap: 'serve-snap',
  },
  sessionCookie: 'a_session_appchat',
  heartbeatIntervalMs: 5_000,
  presenceTtlMs: 24 * 60 * 60 * 1000,
  snapTtlMs: 24 * 60 * 60 * 1000,
} as const
