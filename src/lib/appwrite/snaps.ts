import {
  ID,
  Query,
  Permission as ClientPermission,
  Role as ClientRole,
  ExecutionMethod,
  Channel,
} from 'appwrite'
import type { Models } from 'appwrite'
import { Permission, Role } from 'node-appwrite'
import { createServerFn } from '@tanstack/react-start'
import { storage, tablesDB, functions, realtime } from './client'
import { createSessionClient, createAdminClient } from './server'
import { appwrite } from './config'

export type Snap = Models.Row & {
  senderId: string
  recipientId: string
  fileId: string
  viewedAt: string | null
}

export type InboxSnap = Omit<Snap, 'fileId'> & {
  senderName: string
}

export const SNAP_RECEIVED_EVENT = 'appchat:snap-received'

export const createSnapRow = createServerFn({ method: 'POST' })
  .inputValidator((data: { recipientId: string; fileId: string }) => data)
  .handler(async ({ data }) => {
    const { account } = createSessionClient()
    const me = await account.get()
    const { tablesDB: admin } = createAdminClient()

    const row = await admin.createRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.snaps,
      rowId: ID.unique(),
      data: {
        senderId: me.$id,
        recipientId: data.recipientId,
        fileId: data.fileId,
        viewedAt: null,
      },
      permissions: [
        Permission.read(Role.user(me.$id)),
        Permission.read(Role.user(data.recipientId)),
        Permission.update(Role.user(data.recipientId)),
        Permission.delete(Role.user(me.$id)),
      ],
    })
    return JSON.parse(JSON.stringify(row)) as Snap
  })

export async function sendSnap(
  senderId: string,
  recipientId: string,
  file: File,
): Promise<Snap> {
  const uploaded = await storage.createFile({
    bucketId: appwrite.buckets.snaps,
    fileId: ID.unique(),
    file,
    permissions: [ClientPermission.read(ClientRole.user(senderId))],
  })
  return createSnapRow({ data: { recipientId, fileId: uploaded.$id } })
}

export const listInboxSnaps = createServerFn({ method: 'GET' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { account } = createSessionClient()
    const me = await account.get()
    if (me.$id !== data.userId)
      throw new Error("cannot list another user's snaps")

    const { tablesDB: sessionTablesDB } = createSessionClient()
    const cutoff = new Date(Date.now() - appwrite.snapTtlMs).toISOString()
    const result = await sessionTablesDB.listRows({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.snaps,
      queries: [
        Query.equal('recipientId', data.userId),
        Query.greaterThan('$createdAt', cutoff),
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ],
    })
    const { users } = createAdminClient()
    const names = new Map<string, string>()
    const snaps = await Promise.all(
      (result.rows as unknown as Snap[]).map(async (snap) => {
        let senderName = names.get(snap.senderId)
        if (!senderName) {
          const sender = await users.get({ userId: snap.senderId })
          senderName = sender.name || sender.email
          names.set(snap.senderId, senderName)
        }
        const snapWithoutFileId = { ...snap }
        delete (snapWithoutFileId as Partial<Pick<Snap, 'fileId'>>).fileId

        return { ...(snapWithoutFileId as Omit<Snap, 'fileId'>), senderName }
      }),
    )
    return JSON.parse(JSON.stringify(snaps)) as InboxSnap[]
  })

export async function markSnapViewed(snapId: string) {
  await tablesDB.updateRow({
    databaseId: appwrite.databaseId,
    tableId: appwrite.tables.snaps,
    rowId: snapId,
    data: { viewedAt: new Date().toISOString() },
  })
}

export async function fetchSnapImage(snapId: string): Promise<string> {
  const exec = await functions.createExecution({
    functionId: appwrite.functions.serveSnap,
    xpath: `/snap/${snapId}`,
    method: ExecutionMethod.GET,
  })
  if (exec.responseStatusCode !== 200) {
    throw new Error(`snap ${snapId} unavailable (${exec.responseStatusCode})`)
  }
  const { contentType, base64 } = JSON.parse(exec.responseBody) as {
    contentType: string
    base64: string
  }
  return `data:${contentType};base64,${base64}`
}

export function subscribeToMySnaps(
  userId: string,
  onNew: (snap: Snap) => void,
) {
  return realtime.subscribe<Snap>(
    Channel.tablesdb(appwrite.databaseId)
      .table(appwrite.tables.snaps)
      .row()
      .create(),
    (msg) => {
      if (msg.payload.recipientId === userId) onNew(msg.payload)
    },
  )
}
