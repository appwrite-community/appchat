import { createServerFn } from '@tanstack/react-start'
import { setCookie, deleteCookie } from '@tanstack/react-start/server'
import { ID } from 'node-appwrite'
import { account as browserAccount } from './client'
import { createSessionClient, createAdminClient } from './server'
import { appwrite } from './config'

function applySessionCookie(secret: string, expireIso: string) {
  setCookie(appwrite.sessionCookie, secret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    expires: new Date(expireIso),
  })
}

export const setSessionCookieServer = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { users } = createAdminClient()
    const session = await users.createSession({ userId: data.userId })
    applySessionCookie(session.secret, session.expire)
    return { ok: true }
  })

export const signUpServer = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { name: string; email: string; password: string }) => data,
  )
  .handler(async ({ data }) => {
    const name = data.name.trim()
    const email = data.email.trim().toLowerCase()
    if (!name) throw new Error('name is required')

    const { users } = createAdminClient()
    await users.create({
      userId: ID.unique(),
      email,
      password: data.password,
      name,
    })
    return { ok: true }
  })

export const signOutServer = createServerFn({ method: 'POST' }).handler(
  async () => {
    try {
      const { account } = createSessionClient()
      await account.deleteSession({ sessionId: 'current' })
    } catch {
      // session may already be gone
    }
    deleteCookie(appwrite.sessionCookie, { path: '/' })
    return { ok: true }
  },
)

export const getServerUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const { account } = createSessionClient()
      const user = await account.get()
      return { $id: user.$id, name: user.name, email: user.email }
    } catch {
      return null
    }
  },
)

export async function signIn(email: string, password: string) {
  await clearBrowserSession()
  const session = await browserAccount.createEmailPasswordSession({
    email,
    password,
  })
  await setSessionCookieServer({
    data: { userId: session.userId },
  })
  return { ok: true }
}

export async function signUp(name: string, email: string, password: string) {
  await clearBrowserSession()
  await signUpServer({ data: { name, email, password } })
  const session = await browserAccount.createEmailPasswordSession({
    email: email.trim().toLowerCase(),
    password,
  })
  await setSessionCookieServer({
    data: { userId: session.userId },
  })
  return { ok: true }
}

export async function signOut() {
  await clearBrowserSession()
  await signOutServer()
}

async function clearBrowserSession() {
  try {
    await browserAccount.deleteSession({ sessionId: 'current' })
  } catch {
    // Browser session may already be gone.
  }
}
