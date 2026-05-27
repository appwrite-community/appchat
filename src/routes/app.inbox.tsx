import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchSnapImageFromBrowserSession,
  listInboxSnaps,
  markSnapViewed,
  SNAP_RECEIVED_EVENT,
} from '#/lib/appwrite/snaps'
import type { InboxSnap } from '#/lib/appwrite/snaps'
import { Route as AppRoute } from './app'
import { avatarUrlFor } from '#/lib/appwrite/presence'

export const Route = createFileRoute('/app/inbox')({
  component: InboxPage,
  loader: async () => {
    const { getServerUser } = await import('#/lib/appwrite/auth')
    const user = await getServerUser()
    if (!user) return { snaps: [] }
    const snaps = await listInboxSnaps({ data: { userId: user.$id } })
    return { snaps }
  },
})

function InboxPage() {
  const { user } = AppRoute.useLoaderData()
  const initial = Route.useLoaderData()
  const [snaps, setSnaps] = useState<InboxSnap[]>(initial.snaps)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const refreshSnaps = () => {
      void listInboxSnaps({ data: { userId: user.$id } }).then(setSnaps)
    }
    window.addEventListener(SNAP_RECEIVED_EVENT, refreshSnaps)
    return () => {
      window.removeEventListener(SNAP_RECEIVED_EVENT, refreshSnaps)
    }
  }, [user.$id])

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Inbox</h1>

      {snaps.length === 0 ? (
        <p className="text-[var(--appchat-muted)]">
          No snaps in the last 24 hours. Friends&apos; snaps will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {snaps.map((s) => (
            <li
              key={s.$id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--appchat-surface)] border border-[var(--appchat-border)]"
            >
              <div className="flex items-center gap-3">
                <img
                  src={avatarUrlFor(s.senderName)}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <div className="text-sm font-semibold">
                    From {s.senderName}
                  </div>
                  <div className="text-xs text-[var(--appchat-muted)]">
                    {formatRelative(s.$createdAt)}
                    {s.viewedAt ? ' · viewed' : ' · new'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpenId(s.$id)}
                className="rounded-lg bg-[var(--appchat-yellow)] text-black font-semibold px-4 py-1.5"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <SnapViewer
          snapId={openId}
          onClose={() => setOpenId(null)}
          onView={() => void markSnapViewed(openId)}
        />
      )}
    </div>
  )
}

function SnapViewer({
  snapId,
  onClose,
  onView,
}: {
  snapId: string
  onClose: () => void
  onView: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchSnapImageFromBrowserSession(snapId)
      .then((url) => {
        if (!live) return
        setSrc(url)
        onView()
      })
      .catch(
        (e) =>
          live && setErr(e instanceof Error ? e.message : 'failed to load'),
      )
    return () => {
      live = false
    }
  }, [snapId, onView])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black flex items-center justify-center"
    >
      {err && <p className="text-red-400 px-6 text-center">{err}</p>}
      {!err && !src && (
        <p className="text-[var(--appchat-muted)] animate-pulse">Loading…</p>
      )}
      {src && (
        <img
          onClick={(e) => e.stopPropagation()}
          src={src}
          alt=""
          className="max-w-[100vw] max-h-[100vh] w-auto h-auto object-contain"
        />
      )}
      <button
        onClick={onClose}
        className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center text-lg font-bold shadow-lg"
        aria-label="close"
      >
        ✕
      </button>
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}
