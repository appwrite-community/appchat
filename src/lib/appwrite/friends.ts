import { ID, Query, Permission, Role } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createServerFn } from '@tanstack/react-start'
import { createSessionClient, createAdminClient } from './server'
import { appwrite } from './config'

type FriendRequestRow = Models.Row & {
  fromUserId: string
  toUserId: string
  status: 'pending' | 'accepted' | 'declined'
}

export type FriendRequest = FriendRequestRow & {
  fromName: string
}

type FriendshipRow = Models.Row & {
  userA: string
  userB: string
}

export type Friendship = FriendshipRow & {
  friendId: string
  friendName: string
}

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

async function requireUser() {
  const { account } = createSessionClient()
  return account.get()
}

async function nameForUser(userId: string): Promise<string> {
  const { users } = createAdminClient()
  const user = await users.get({ userId })
  return user.name || user.email
}

export const findUserByEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const { users } = createAdminClient()
    const result = await users.list({
      queries: [Query.equal('email', data.email.toLowerCase()), Query.limit(1)],
    })
    if (result.users.length === 0) return null
    const [u] = result.users
    return { userId: u.$id, name: u.name }
  })

export const sendFriendRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { toUserId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    if (me.$id === data.toUserId) throw new Error('cannot friend yourself')

    const { tablesDB } = createAdminClient()
    const row = await tablesDB.createRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      rowId: ID.unique(),
      data: {
        fromUserId: me.$id,
        toUserId: data.toUserId,
        status: 'pending',
      },
      permissions: [
        Permission.read(Role.user(me.$id)),
        Permission.read(Role.user(data.toUserId)),
        Permission.update(Role.user(data.toUserId)),
        Permission.delete(Role.user(me.$id)),
        Permission.delete(Role.user(data.toUserId)),
      ],
    })
    return plain(row)
  })

export const acceptFriendRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { requestId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    const { tablesDB } = createAdminClient()

    const req = (await tablesDB.getRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      rowId: data.requestId,
    })) as unknown as FriendRequest

    if (req.toUserId !== me.$id) throw new Error('only recipient can accept')

    await tablesDB.updateRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      rowId: req.$id,
      data: { status: 'accepted' },
    })

    const [userA, userB] = sortedPair(req.fromUserId, req.toUserId)

    await tablesDB.createRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendships,
      rowId: ID.unique(),
      data: { userA, userB },
      permissions: [
        Permission.read(Role.user(userA)),
        Permission.read(Role.user(userB)),
        Permission.delete(Role.user(userA)),
        Permission.delete(Role.user(userB)),
      ],
    })
    return { ok: true }
  })

export const declineFriendRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { requestId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    const { tablesDB } = createAdminClient()
    const req = (await tablesDB.getRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      rowId: data.requestId,
    })) as unknown as FriendRequest
    if (req.toUserId !== me.$id) throw new Error('only recipient can decline')

    await tablesDB.updateRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      rowId: req.$id,
      data: { status: 'declined' },
    })
    return { ok: true }
  })

export const removeFriendship = createServerFn({ method: 'POST' })
  .inputValidator((data: { friendshipId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    const { tablesDB } = createAdminClient()
    const row = (await tablesDB.getRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendships,
      rowId: data.friendshipId,
    })) as unknown as Friendship
    if (row.userA !== me.$id && row.userB !== me.$id)
      throw new Error('not your friendship')

    await tablesDB.deleteRow({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendships,
      rowId: row.$id,
    })
    return { ok: true }
  })

export const listMyFriends = createServerFn({ method: 'GET' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    if (me.$id !== data.userId)
      throw new Error("cannot list another user's friends")

    const { tablesDB } = createSessionClient()
    const [asA, asB] = await Promise.all([
      tablesDB.listRows({
        databaseId: appwrite.databaseId,
        tableId: appwrite.tables.friendships,
        queries: [Query.equal('userA', data.userId)],
      }),
      tablesDB.listRows({
        databaseId: appwrite.databaseId,
        tableId: appwrite.tables.friendships,
        queries: [Query.equal('userB', data.userId)],
      }),
    ])
    const rows = [...asA.rows, ...asB.rows] as unknown as FriendshipRow[]
    const friends = await Promise.all(
      rows.map(async (row) => {
        const friendId = row.userA === data.userId ? row.userB : row.userA
        return {
          ...row,
          friendId,
          friendName: await nameForUser(friendId),
        }
      }),
    )
    return plain(friends)
  })

export const listIncomingRequests = createServerFn({ method: 'GET' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const me = await requireUser()
    if (me.$id !== data.userId)
      throw new Error("cannot list another user's requests")

    const { tablesDB } = createSessionClient()
    const result = await tablesDB.listRows({
      databaseId: appwrite.databaseId,
      tableId: appwrite.tables.friendRequests,
      queries: [
        Query.equal('toUserId', data.userId),
        Query.equal('status', 'pending'),
      ],
    })
    const requests = await Promise.all(
      result.rows.map(async (row) => {
        const request = row as unknown as FriendRequestRow
        return {
          ...request,
          fromName: await nameForUser(request.fromUserId),
        }
      }),
    )
    return plain(requests)
  })
