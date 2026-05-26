import type { Models } from 'appwrite'
import { createServerFn } from '@tanstack/react-start'
import { Permission, Role, Presences } from 'node-appwrite'
import { client, presences, realtime, avatars } from './client'
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

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

export function avatarUrlFor(name: string): string {
  return avatars.getInitials({ name }).toString()
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
    await adminPresences.upsert({
      presenceId: user.$id,
      userId: user.$id,
      status: 'online',
      metadata: data.metadata,
      expiresAt: expiresAtFromNow(appwrite.presenceTtlMs),
      permissions: [
        Permission.read(Role.users()),
        Permission.update(Role.user(user.$id)),
        Permission.delete(Role.user(user.$id)),
      ],
    })
    return { ok: true }
  })

export async function upsertMyPresence(metadata: PresenceMetadata) {
  return upsertPresenceServer({ data: { metadata } })
}

export async function listLivePresences(): Promise<PresenceRecord[]> {
  const result = await presences.list()
  return result.presences as unknown as PresenceRecord[]
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
