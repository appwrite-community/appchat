import { Client, Account, TablesDB, Users } from 'node-appwrite'
import { getCookie } from '@tanstack/react-start/server'
import { appwrite } from './config'

export function createSessionClient() {
  const client = new Client()
    .setEndpoint(appwrite.endpoint)
    .setProject(appwrite.projectId)
  const secret = getCookie(appwrite.sessionCookie)
  if (secret) client.setSession(secret)

  return {
    client,
    account: new Account(client),
    tablesDB: new TablesDB(client),
  }
}

export function createAdminClient() {
  const apiKey = process.env.APPWRITE_API_KEY
  if (!apiKey)
    throw new Error('APPWRITE_API_KEY env var is not set on the server')
  const client = new Client()
    .setEndpoint(appwrite.endpoint)
    .setProject(appwrite.projectId)
    .setKey(apiKey)

  return {
    client,
    users: new Users(client),
    tablesDB: new TablesDB(client),
  }
}
