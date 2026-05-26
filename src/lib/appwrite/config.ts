export const appwrite = {
  endpoint: 'http://localhost/v1',
  projectId: 'appchat',
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
