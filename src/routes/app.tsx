import { useEffect, useRef, useState } from 'react'
import {
  Outlet,
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { getServerUser, signOut } from '#/lib/appwrite/auth'
import { SNAP_RECEIVED_EVENT, subscribeToMySnaps } from '#/lib/appwrite/snaps'
import type { Snap } from '#/lib/appwrite/snaps'

export const Route = createFileRoute('/app')({
  loader: async () => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/' })
    return {
      user: { $id: user.$id, name: user.name, email: user.email },
    }
  },
  component: AppShell,
})

function AppShell() {
  const router = useRouter()
  const { user } = Route.useLoaderData()
  const [snapToast, setSnapToast] = useState<Snap | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const sub = subscribeToMySnaps(user.$id, (snap) => {
      window.dispatchEvent(
        new CustomEvent<Snap>(SNAP_RECEIVED_EVENT, { detail: snap }),
      )
      setSnapToast(snap)
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(() => {
        setSnapToast(null)
        toastTimerRef.current = null
      }, 4_000)
    })

    return () => {
      sub.then((s) => s.close())
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [user.$id])

  async function logout() {
    clearAppChatLocalState()
    await signOut()
    await router.invalidate()
    router.navigate({ to: '/' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--appchat-ink)]">
      {snapToast && (
        <Link
          to="/app/inbox"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-[var(--appchat-yellow)] text-black px-5 py-3 font-display font-bold shadow-2xl border border-black/10"
        >
          <span>📸</span>
          <span>New snap from a friend</span>
          <span className="text-xs uppercase tracking-wide bg-black/10 rounded-full px-2 py-1">
            Open
          </span>
        </Link>
      )}
      <header className="relative z-30 flex items-center justify-between px-6 py-3.5">
        <Link to="/app" className="flex items-center gap-2.5 group">
          <span className="w-8 h-8 rounded-full bg-[var(--appchat-yellow)] flex items-center justify-center text-black text-base transition-transform group-hover:rotate-[8deg]">
            👻
          </span>
          <span className="font-display font-extrabold text-[19px] tracking-tight">
            AppChat
          </span>
        </Link>
        <nav className="flex items-center gap-1 rounded-full p-1 bg-[var(--appchat-surface)] border border-[var(--appchat-border)]">
          <TabLink to="/app/map" label="Map" />
          <TabLink to="/app/friends" label="Friends" />
          <TabLink to="/app/inbox" label="Inbox" />
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--appchat-muted)] font-display font-semibold">
            {user.name}
          </span>
          <button
            onClick={logout}
            className="text-sm rounded-full px-3.5 py-1.5 border border-[var(--appchat-border-strong)] hover:border-white hover:bg-white/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 relative">
        <Outlet />
      </main>
    </div>
  )
}

function clearAppChatLocalState() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('appchat:')) localStorage.removeItem(key)
  }
}

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-4 py-1.5 rounded-full text-sm font-display font-semibold text-[var(--appchat-muted)] hover:text-white transition-colors"
      activeProps={{
        className:
          'px-4 py-1.5 rounded-full text-sm font-display font-semibold bg-[var(--appchat-yellow)] text-black',
      }}
    >
      {label}
    </Link>
  )
}
