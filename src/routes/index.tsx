import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { signIn, signUp, getServerUser } from '#/lib/appwrite/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const user = await getServerUser()
    if (user) throw redirect({ to: '/app' })
  },
  component: AuthPage,
})

function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()
    if (mode === 'signup' && !trimmedName) {
      setError('name is required')
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') await signUp(trimmedName, trimmedEmail, password)
      else await signIn(trimmedEmail, password)
      await router.invalidate()
      router.navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2">
            <GhostMark />
            <span className="text-3xl font-black tracking-tight">AppChat</span>
          </div>
          <p className="mt-2 text-sm text-[var(--appchat-muted)]">
            Snaps, friends, on a globe.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl bg-[var(--appchat-surface)] p-6 border border-[var(--appchat-border)]"
        >
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--appchat-surface-2)] p-1">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`rounded-lg py-2 text-sm font-display font-semibold ${
                mode === 'signin'
                  ? 'bg-[var(--appchat-yellow)] text-black'
                  : 'text-[var(--appchat-muted)] hover:text-white'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-lg py-2 text-sm font-display font-semibold ${
                mode === 'signup'
                  ? 'bg-[var(--appchat-yellow)] text-black'
                  : 'text-[var(--appchat-muted)] hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          {mode === 'signup' && (
            <Field
              label="Name"
              value={name}
              onChange={setName}
              type="text"
              autoComplete="name"
            />
          )}
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--appchat-yellow)] text-black font-semibold py-3 hover:bg-[var(--appchat-yellow-dim)] disabled:opacity-60"
          >
            {busy ? '...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-sm text-[var(--appchat-muted)] hover:text-white"
          >
            {mode === 'signin'
              ? 'New here? Create an account'
              : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: string
  autoComplete: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--appchat-muted)] uppercase tracking-wide">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        autoComplete={autoComplete}
        required
        className="mt-1 w-full rounded-lg bg-[var(--appchat-surface-2)] border border-[var(--appchat-border)] px-3 py-2 text-white focus:outline-none focus:border-[var(--appchat-yellow)]"
      />
    </label>
  )
}

function GhostMark() {
  return (
    <div className="w-9 h-9 rounded-full bg-[var(--appchat-yellow)] flex items-center justify-center text-black text-xl">
      👻
    </div>
  )
}
