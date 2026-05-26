import { Client, TablesDB, Storage, AppwriteException } from 'node-appwrite'

const DATABASE_ID = 'appchat-db'
const SNAPS_TABLE_ID = 'snaps'
const SNAPS_BUCKET_ID = 'snaps'
const SNAP_TTL_MS = 24 * 60 * 60 * 1000

function unauthorized(res) {
  return res.json({ message: 'unauthorized' }, 401)
}

function expired(res) {
  return res.json({ message: 'snap expired' }, 410)
}

export default async ({ req, res, log, error }) => {
  const match = req.path.match(/^\/snap\/([A-Za-z0-9_-]+)\/?$/)
  if (!match || req.method !== 'GET') {
    return res.json({ message: 'not found' }, 404)
  }
  const snapId = match[1]

  const jwt = req.headers['x-appwrite-user-jwt'] || req.query?.token
  if (!jwt) return unauthorized(res)

  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY
  if (!apiKey) {
    error('APPWRITE_API_KEY env var is not set')
    return res.json({ message: 'internal error' }, 500)
  }

  const callerClient = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setJWT(jwt)
  const callerTables = new TablesDB(callerClient)

  let snap
  try {
    snap = await callerTables.getRow({
      databaseId: DATABASE_ID,
      tableId: SNAPS_TABLE_ID,
      rowId: snapId,
    })
  } catch (e) {
    if (e instanceof AppwriteException && (e.code === 401 || e.code === 404)) {
      return unauthorized(res)
    }
    error(e.message)
    return res.json({ message: 'internal error' }, 500)
  }

  const ageMs = Date.now() - new Date(snap.$createdAt).getTime()
  if (ageMs > SNAP_TTL_MS) return expired(res)

  const adminClient = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
  const adminStorage = new Storage(adminClient)

  let file
  let bytes
  try {
    const result = await Promise.all([
      adminStorage.getFile({ bucketId: SNAPS_BUCKET_ID, fileId: snap.fileId }),
      adminStorage.getFileView({
        bucketId: SNAPS_BUCKET_ID,
        fileId: snap.fileId,
      }),
    ])
    file = result[0]
    bytes = result[1]
  } catch (e) {
    error(e.message)
    return res.json({ message: 'internal error' }, 500)
  }

  return res.json(
    {
      contentType: file.mimeType,
      base64: Buffer.from(bytes).toString('base64'),
    },
    200,
  )
}
