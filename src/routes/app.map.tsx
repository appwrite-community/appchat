import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SnapGlobe } from '#/components/SnapGlobe'
import {
  avatarUrlFor,
  listLivePresences,
  startHeartbeat,
  subscribeToPresences,
  upsertMyPresence,
} from '#/lib/appwrite/presence'
import type { PresenceMetadata, PresenceRecord } from '#/lib/appwrite/presence'
import { listInboxSnaps, SNAP_RECEIVED_EVENT } from '#/lib/appwrite/snaps'
import type { Snap } from '#/lib/appwrite/snaps'
import { Route as AppRoute } from './app'

const LOCATION_KEY = 'appchat:my-location'

type Location = { lat: number; lng: number }

export const Route = createFileRoute('/app/map')({
  component: MapPage,
})

function MapPage() {
  const { user } = AppRoute.useLoaderData()
  const [presences, setPresences] = useState<PresenceRecord[]>([])
  const [myLoc, setMyLoc] = useState<Location | null>(null)
  const [snapSenderIds, setSnapSenderIds] = useState<Set<string>>(new Set())
  const [isMovingPin, setIsMovingPin] = useState(false)
  const myLocRef = useRef<Location | null>(null)
  const myLocationKey = `${LOCATION_KEY}:${user.$id}`

  useEffect(() => {
    localStorage.removeItem(LOCATION_KEY)
    setMyLoc(null)
    myLocRef.current = null
    const raw = localStorage.getItem(myLocationKey)
    if (!raw) return
    try {
      const stored = JSON.parse(raw)
      if (isLocation(stored)) setMyLoc(stored)
    } catch {
      localStorage.removeItem(myLocationKey)
    }
  }, [myLocationKey])

  useEffect(() => {
    myLocRef.current = myLoc
  }, [myLoc])

  useEffect(() => {
    listLivePresences()
      .then((rows) => {
        const ownPresence = rows.find((r) => r.userId === user.$id)
        if (!myLocRef.current && isLocation(ownPresence?.metadata)) {
          const nextLoc = {
            lat: ownPresence.metadata.lat,
            lng: ownPresence.metadata.lng,
          }
          setMyLoc(nextLoc)
          localStorage.setItem(myLocationKey, JSON.stringify(nextLoc))
        }

        // Merge server rows into local state but DO NOT overwrite our own row
        // if we already have a (likely fresher) local copy. Initial fetch can
        // resolve after the user has clicked, and we don't want it stomping the
        // optimistic update with whatever was on the server when the page loaded.
        setPresences((prev) => {
          const mine = prev.find((p) => p.userId === user.$id)
          const merged = rows.map((r) =>
            r.userId === user.$id && mine ? mine : r,
          )
          if (mine && !merged.some((r) => r.userId === user.$id))
            merged.push(mine)
          return merged
        })
      })
      .catch(() => {})
    const sub = subscribeToPresences((p, action) => {
      setPresences((prev) => {
        if (action === 'delete') return prev.filter((x) => x.$id !== p.$id)
        // Our own realtime echo can race with the optimistic update. We're the
        // source of truth for our own row; ignore inbound events for it.
        if (p.userId === user.$id) return prev
        const idx = prev.findIndex((x) => x.$id === p.$id)
        if (idx === -1) return [...prev, p]
        const next = [...prev]
        next[idx] = p
        return next
      })
    })
    return () => {
      sub.then((s) => s.close())
    }
  }, [myLocationKey, user.$id])

  useEffect(() => {
    listInboxSnaps({ data: { userId: user.$id } })
      .then((rows) => setSnapSenderIds(new Set(rows.map((r) => r.senderId))))
      .catch(() => {})
    const highlightSender = (event: Event) => {
      const snap = (event as CustomEvent<Snap>).detail
      setSnapSenderIds((prev) => new Set(prev).add(snap.senderId))
    }
    window.addEventListener(SNAP_RECEIVED_EVENT, highlightSender)
    return () => {
      window.removeEventListener(SNAP_RECEIVED_EVENT, highlightSender)
    }
  }, [user.$id])

  // Ref-based metadata so the heartbeat's interval always reads the latest pin
  // position. Restarting the heartbeat on every myLoc change races: the previous
  // interval can still have an in-flight upsert with stale coords that lands AFTER
  // the click, overwriting the server state and the realtime echo then snaps the
  // pin back.
  const metaRef = useRef<PresenceMetadata | null>(null)
  useEffect(() => {
    metaRef.current = myLoc ? metadataFor(user, myLoc) : null
  }, [myLoc, user.name, user.email])

  useEffect(() => {
    return startHeartbeat(() => metaRef.current)
  }, [])

  const pins = useMemo(() => {
    const myMeta = myLoc ? metadataFor(user, myLoc) : null
    const mapped = presences
      .filter(
        (p) =>
          Number.isFinite(p.metadata.lat) && Number.isFinite(p.metadata.lng),
      )
      .map((p) => {
        const metadata = p.userId === user.$id && myMeta ? myMeta : p.metadata
        return {
          id: p.userId,
          lat: metadata.lat,
          lng: metadata.lng,
          label: metadata.displayName,
          avatarUrl: metadata.avatarUrl,
          isMe: p.userId === user.$id,
        }
      })

    if (myMeta && !mapped.some((p) => p.id === user.$id)) {
      mapped.push({
        id: user.$id,
        lat: myMeta.lat,
        lng: myMeta.lng,
        label: myMeta.displayName,
        avatarUrl: myMeta.avatarUrl,
        isMe: true,
      })
    }

    return mapped.sort((a, b) => Number(a.isMe) - Number(b.isMe))
  }, [myLoc, presences, user])

  const liveFriendCount = pins.filter((p) => !p.isMe).length
  const canPickLocation = !myLoc || isMovingPin

  function onLocationPick(coords: Location) {
    if (!canPickLocation || !isLocation(coords)) return

    const nextMeta = metadataFor(user, coords)
    setMyLoc(coords)
    metaRef.current = nextMeta
    localStorage.setItem(myLocationKey, JSON.stringify(coords))
    setIsMovingPin(false)
    // Optimistic local update: move the own pin immediately.
    setPresences((prev) => {
      const idx = prev.findIndex((p) => p.userId === user.$id)
      if (idx === -1) {
        return [
          ...prev,
          {
            $id: user.$id,
            userId: user.$id,
            status: 'online',
            metadata: nextMeta,
          } as PresenceRecord,
        ]
      }
      const next = [...prev]
      next[idx] = { ...next[idx], metadata: nextMeta }
      return next
    })
    // Fire-and-forget immediate upsert so a reload right after a click sees the
    // new coords without waiting for the next heartbeat tick.
    void upsertMyPresence(nextMeta).catch((err) => {
      console.error('[presence] location update failed', err)
    })
  }

  return (
    <div className="absolute inset-0">
      <SnapGlobe
        pins={pins}
        onGlobeClick={canPickLocation ? onLocationPick : undefined}
        highlight={snapSenderIds}
        initialPov={myLoc ?? undefined}
        isLocationPickerActive={canPickLocation}
      />

      {/* No-pin onboarding overlay */}
      {!myLoc && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center z-10 appchat-rise">
          <div className="px-7 py-6 rounded-3xl bg-black/55 border border-[var(--appchat-border)] backdrop-blur-md max-w-md">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--appchat-yellow)] font-display font-bold mb-3">
              Step 1
            </p>
            <h2 className="font-display text-3xl font-extrabold leading-tight">
              Drop your pin on the globe.
            </h2>
            <p className="mt-2 text-sm text-[var(--appchat-muted)]">
              Click anywhere on Earth to place yourself. Your friends will see
              you appear in realtime.
            </p>
          </div>
        </div>
      )}

      {/* Location chip (bottom-center) */}
      {myLoc && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 appchat-rise">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/70 border border-[var(--appchat-border)] backdrop-blur-md shadow-2xl">
            <span className="w-2 h-2 rounded-full bg-[var(--appchat-yellow)] shadow-[0_0_10px_2px_rgba(255,252,0,0.6)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--appchat-muted)]">
              You're at
            </span>
            <span className="font-mono text-sm text-white">
              {fmtCoord(myLoc.lat)}, {fmtCoord(myLoc.lng)}
            </span>
            <span className="w-px h-4 bg-[var(--appchat-border-strong)]" />
            <button
              onClick={() => setIsMovingPin((v) => !v)}
              className="text-xs text-[var(--appchat-yellow)] hover:text-[var(--appchat-yellow-hover)] font-display font-semibold"
            >
              {isMovingPin ? 'Cancel' : 'Move pin'}
            </button>
          </div>
        </div>
      )}

      {/* Move-pin overlay hint */}
      {isMovingPin && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="px-4 py-2 rounded-full bg-[var(--appchat-yellow)] text-black font-display font-bold text-sm shadow-2xl">
            Click anywhere on the globe
          </div>
        </div>
      )}

      {/* Live friend count (top-right corner badge) */}
      <div className="absolute top-4 right-6 z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/55 border border-[var(--appchat-border)] backdrop-blur-md appchat-rise">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--appchat-mint)] animate-pulse" />
        <span className="text-xs text-[var(--appchat-muted)]">
          <span className="font-display font-bold text-white">
            {liveFriendCount}
          </span>{' '}
          live nearby
        </span>
      </div>
    </div>
  )
}

function fmtCoord(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(3)}°`
}

function metadataFor(
  user: { name?: string | null; email: string },
  loc: Location,
): PresenceMetadata {
  const displayName = user.name || user.email
  return {
    lat: loc.lat,
    lng: loc.lng,
    displayName,
    avatarUrl: avatarUrlFor(displayName),
  }
}

function isLocation(value: unknown): value is Location {
  if (!value || typeof value !== 'object') return false
  const loc = value as Partial<Location>
  return Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
}
