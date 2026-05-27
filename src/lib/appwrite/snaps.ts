import { Channel } from 'appwrite'
import type { Models } from 'appwrite'
import { ExecutionMethod, ID, Permission, Query, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { createServerFn } from '@tanstack/react-start'
import { functions, realtime } from './client'
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

type SendSnapInput = {
  recipientId: string
  fileName: string
  mimeType: string
  base64: string
}

const ALLOWED_SNAP_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const sendSnapServer = createServerFn({ method: 'POST' })
  .inputValidator((data: SendSnapInput) => data)
  .handler(async ({ data }) => {
    const { account } = createSessionClient()
    const me = await account.get()
    const { storage: adminStorage, tablesDB: adminTables } = createAdminClient()
    if (!ALLOWED_SNAP_TYPES.has(data.mimeType)) {
      throw new Error('choose a PNG, JPEG, or WebP image')
    }

    const bytes = Uint8Array.from(Buffer.from(data.base64, 'base64'))
    const uploaded = await adminStorage.createFile({
      bucketId: appwrite.buckets.snaps,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(bytes, data.fileName),
      permissions: [Permission.read(Role.user(me.$id))],
    })

    const row = await adminTables.createRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.snaps,
      rowId: ID.unique(),
      data: {
        senderId: me.$id,
        recipientId: data.recipientId,
        fileId: uploaded.$id,
        viewedAt: null,
      },
      permissions: [
        Permission.read(Role.user(me.$id)),
        Permission.read(Role.user(data.recipientId)),
        Permission.delete(Role.user(me.$id)),
      ],
    })
    return JSON.parse(JSON.stringify(row)) as Snap
  })

export async function sendSnap(recipientId: string, file: File): Promise<Snap> {
  const base64 = await fileToBase64(file)
  return sendSnapServer({
    data: {
      recipientId,
      fileName: file.name || 'snap',
      mimeType: file.type,
      base64,
    },
  })
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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

export const markSnapViewedServer = createServerFn({ method: 'POST' })
  .inputValidator((data: { snapId: string }) => data)
  .handler(async ({ data }) => {
    const { account, tablesDB: sessionTablesDB } = createSessionClient()
    const me = await account.get()
    const snap = await sessionTablesDB.getRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.snaps,
      rowId: data.snapId,
    })
    if (snap.recipientId !== me.$id) {
      throw new Error("cannot mark another user's snap as viewed")
    }

    const { tablesDB: adminTablesDB } = createAdminClient()
    await adminTablesDB.updateRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.snaps,
      rowId: data.snapId,
      data: { viewedAt: new Date().toISOString() },
    })
    return { ok: true }
  })

export async function markSnapViewed(snapId: string) {
  await markSnapViewedServer({ data: { snapId } })
}

export const fetchSnapImageServer = createServerFn({ method: 'GET' })
  .inputValidator((data: { snapId: string }) => data)
  .handler(async ({ data }) => {
    const { account, functions: sessionFunctions } = createSessionClient()
    await account.get()
    const exec = await sessionFunctions.createExecution({
      functionId: appwrite.functions.serveSnap,
      xpath: `/snap/${data.snapId}`,
      method: ExecutionMethod.GET,
    })
    if (exec.responseStatusCode !== 200) {
      throw new Error(
        `snap ${data.snapId} unavailable (${exec.responseStatusCode})`,
      )
    }
    const { contentType, base64 } = JSON.parse(exec.responseBody) as {
      contentType: string
      base64: string
    }
    return `data:${contentType};base64,${base64}`
  })

export async function fetchSnapImage(snapId: string): Promise<string> {
  return fetchSnapImageServer({ data: { snapId } })
}

export async function fetchSnapImageFromBrowserSession(
  snapId: string,
): Promise<string> {
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
