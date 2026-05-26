import {
  Client,
  Account,
  TablesDB,
  Storage,
  Avatars,
  Presences,
  Realtime,
  Functions,
} from 'appwrite'
import { appwrite } from './config'

export const client = new Client()
  .setEndpoint(appwrite.endpoint)
  .setProject(appwrite.projectId)
export const account = new Account(client)
export const tablesDB = new TablesDB(client)
export const storage = new Storage(client)
export const avatars = new Avatars(client)
export const presences = new Presences(client)
export const realtime = new Realtime(client)
export const functions = new Functions(client)
