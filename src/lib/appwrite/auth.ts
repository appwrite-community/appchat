import { createServerFn } from '@tanstack/react-start'
import { setCookie, deleteCookie } from '@tanstack/react-start/server'
import { Account, ID } from 'node-appwrite'
import { account as clientAccount } from './client'
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

export const signInServer = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { client } = createAdminClient()
    const account = new Account(client)
    const session = await account.createEmailPasswordSession({
      email: data.email,
      password: data.password,
    })
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

    const { client } = createAdminClient()
    const account = new Account(client)
    await account.create({
      userId: ID.unique(),
      email,
      password: data.password,
      name,
    })
    const session = await account.createEmailPasswordSession({
      email,
      password: data.password,
    })
    applySessionCookie(session.secret, session.expire)
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
  await signInServer({ data: { email, password } })
  return clientAccount.get()
}

export async function signUp(name: string, email: string, password: string) {
  await signUpServer({ data: { name, email, password } })
  return clientAccount.get()
}

export async function signOut() {
  await signOutServer()
}
