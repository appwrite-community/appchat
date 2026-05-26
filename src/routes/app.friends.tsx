import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  acceptFriendRequest,
  declineFriendRequest,
  findUserByEmail,
  listIncomingRequests,
  listMyFriends,
  removeFriendship,
  sendFriendRequest,
} from '#/lib/appwrite/friends'
import type { FriendRequest, Friendship } from '#/lib/appwrite/friends'
import { Route as AppRoute } from './app'
import { avatarUrlFor } from '#/lib/appwrite/presence'

export const Route = createFileRoute('/app/friends')({
  component: FriendsPage,
  loader: async () => {
    const { getServerUser } = await import('#/lib/appwrite/auth')
    const user = await getServerUser()
    if (!user) return { friends: [], incoming: [] }
    const [friends, incoming] = await Promise.all([
      listMyFriends({ data: { userId: user.$id } }),
      listIncomingRequests({ data: { userId: user.$id } }),
    ])
    return { friends, incoming }
  },
})

function FriendsPage() {
  const { user } = AppRoute.useLoaderData()
  const initial = Route.useLoaderData()
  const [friends, setFriends] = useState<Friendship[]>(initial.friends)
  const [incoming, setIncoming] = useState<FriendRequest[]>(initial.incoming)
  const [targetEmail, setTargetEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // refresh on realtime friend events (simple: re-fetch)
  async function refresh() {
    const [f, i] = await Promise.all([
      listMyFriends({ data: { userId: user.$id } }),
      listIncomingRequests({ data: { userId: user.$id } }),
    ])
    setFriends(f)
    setIncoming(i)
  }

  useEffect(() => {
    const timer = setInterval(refresh, 5_000)
    return () => clearInterval(timer)
  }, [])

  async function send(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    try {
      const target = await findUserByEmail({
        data: { email: targetEmail.trim().toLowerCase() },
      })
      if (!target) throw new Error('user not found, ask them to sign up first')
      if (target.userId === user.$id) throw new Error('that is you')
      await sendFriendRequest({
        data: { toUserId: target.userId },
      })
      setTargetEmail('')
      setInfo(`request sent to ${target.name}`)
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    }
  }

  async function accept(req: FriendRequest) {
    await acceptFriendRequest({ data: { requestId: req.$id } })
    await refresh()
  }
  async function decline(req: FriendRequest) {
    await declineFriendRequest({ data: { requestId: req.$id } })
    await refresh()
  }
  async function remove(f: Friendship) {
    await removeFriendship({ data: { friendshipId: f.$id } })
    await refresh()
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Friends</h1>

      <section className="rounded-2xl bg-[var(--appchat-surface)] border border-[var(--appchat-border)] p-5 mb-6">
        <h2 className="text-sm uppercase tracking-wide text-[var(--appchat-muted)] mb-3">
          Add a friend
        </h2>
        <form onSubmit={send} className="flex gap-2">
          <input
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            type="email"
            required
            placeholder="friend's email"
            className="flex-1 rounded-lg bg-[var(--appchat-surface-2)] border border-[var(--appchat-border)] px-3 py-2 focus:outline-none focus:border-[var(--appchat-yellow)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--appchat-yellow)] text-black font-semibold px-4"
          >
            Send
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {info && <p className="mt-2 text-sm text-emerald-400">{info}</p>}
      </section>

      {incoming.length > 0 && (
        <section className="rounded-2xl bg-[var(--appchat-surface)] border border-[var(--appchat-border)] p-5 mb-6">
          <h2 className="text-sm uppercase tracking-wide text-[var(--appchat-muted)] mb-3">
            Pending requests
          </h2>
          <ul className="space-y-2">
            {incoming.map((req) => (
              <li
                key={req.$id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrlFor(req.fromName)}
                    alt=""
                    className="w-9 h-9 rounded-full"
                  />
                  <span>{req.fromName}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => accept(req)}
                    className="rounded-md bg-[var(--appchat-yellow)] text-black text-sm font-medium px-3 py-1"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline(req)}
                    className="rounded-md border border-[var(--appchat-border)] text-sm px-3 py-1"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-[var(--appchat-surface)] border border-[var(--appchat-border)] p-5">
        <h2 className="text-sm uppercase tracking-wide text-[var(--appchat-muted)] mb-3">
          Your friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-[var(--appchat-muted)]">
            No friends yet. Send a request above.
          </p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li
                key={f.$id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrlFor(f.friendName)}
                    alt=""
                    className="w-9 h-9 rounded-full"
                  />
                  <span>{f.friendName}</span>
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/app/send/$friendId"
                    params={{ friendId: f.friendId }}
                    className="rounded-md bg-[var(--appchat-yellow)] text-black text-sm font-medium px-3 py-1"
                  >
                    Snap
                  </Link>
                  <button
                    onClick={() => remove(f)}
                    className="rounded-md border border-[var(--appchat-border)] text-sm px-3 py-1"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
