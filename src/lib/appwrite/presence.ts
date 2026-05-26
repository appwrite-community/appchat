import type { Models } from 'appwrite'
import { createServerFn } from '@tanstack/react-start'
import { Permission, Query, Role, Presences } from 'node-appwrite'
import { client, realtime, avatars } from './client'
import { createAdminClient, createSessionClient } from './server'
import { appwrite } from './config'

export type PresenceMetadata = {
  lat: number
  lng: number
  displayName: string
  avatarUrl: string
}

export type PresenceRecord = Models.Presence & {
  metadata: PresenceMetadata
}

type FriendshipRow = {
  userA: string
  userB: string
}

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

export function avatarUrlFor(name: string): string {
  return avatars.getInitials({ name }).toString()
}

async function listFriendIdsForPresence(userId: string): Promise<string[]> {
  const { tablesDB } = createAdminClient()
  const [asA, asB] = await Promise.all([
    tablesDB.listRows({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendships,
      queries: [Query.equal('userA', userId)],
    }),
    tablesDB.listRows({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendships,
      queries: [Query.equal('userB', userId)],
    }),
  ])

  return Array.from(
    new Set(
      ([...asA.rows, ...asB.rows] as unknown as FriendshipRow[]).map((row) =>
        row.userA === userId ? row.userB : row.userA,
      ),
    ),
  )
}

// Heartbeats run through the server fn so that the admin client can stamp the right
// permissions on the row. Browser sessions can read presences but cannot grant
// `user:<id>` permissions to other users on create, which makes a pure-client heartbeat
// flow brittle once a row is owned by another identity.
export const upsertPresenceServer = createServerFn({ method: 'POST' })
  .inputValidator((data: { metadata: PresenceMetadata }) => data)
  .handler(async ({ data }) => {
    const { account } = createSessionClient()
    const user = await account.get()
    const { client: adminClient } = createAdminClient()
    const adminPresences = new Presences(adminClient)
    const friendIds = await listFriendIdsForPresence(user.$id)
    await adminPresences.upsert({
      presenceId: user.$id,
      userId: user.$id,
      status: 'online',
      metadata: data.metadata,
      expiresAt: expiresAtFromNow(appwrite.presenceTtlMs),
      permissions: [
        ...[user.$id, ...friendIds].map((id) => Permission.read(Role.user(id))),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ],
    })
    return { ok: true }
  })

export async function upsertMyPresence(metadata: PresenceMetadata) {
  return upsertPresenceServer({ data: { metadata } })
}

export const listLivePresencesServer = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { account, client: sessionClient } = createSessionClient()
  await account.get()
  const sessionPresences = new Presences(sessionClient)
  const result = await sessionPresences.list()
  return JSON.parse(JSON.stringify(result.presences)) as PresenceRecord[]
})

export async function listLivePresences(): Promise<PresenceRecord[]> {
  return listLivePresencesServer()
}

export function subscribeToPresences(
  handler: (
    presence: PresenceRecord,
    event: 'upsert' | 'update' | 'delete',
  ) => void,
) {
  return realtime.subscribe<PresenceRecord>('presences', (msg) => {
    const event = msg.events.find((e) => /\.(upsert|update|delete)$/.test(e))
    if (!event) return
    const action = event.split('.').pop() as 'upsert' | 'update' | 'delete'
    handler(msg.payload, action)
  })
}

export function startHeartbeat(getMetadata: () => PresenceMetadata | null) {
  let stopped = false

  async function tick() {
    if (stopped) return
    const meta = getMetadata()
    if (!meta) return
    try {
      await upsertMyPresence(meta)
    } catch (err) {
      console.error('[heartbeat] upsert failed', err)
    }
  }

  void tick()
  const id = setInterval(tick, appwrite.heartbeatIntervalMs)

  return () => {
    stopped = true
    clearInterval(id)
  }
}

export { client }
