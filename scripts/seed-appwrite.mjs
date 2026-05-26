import {
  AppwriteException,
  Client,
  ID,
  Permission,
  Presences,
  Query,
  Role,
  TablesDB,
  Users,
} from 'node-appwrite'

const endpoint =
  process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1'
const projectId = process.env.APPWRITE_PROJECT_ID ?? 'appchat-demo'
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'appchat-db'
const password = process.env.SEED_PASSWORD ?? 'AppchatDemo123!'

if (!apiKey) {
  console.error('Missing APPWRITE_API_KEY.')
  console.error('Run: APPWRITE_API_KEY=... pnpm seed:appwrite')
  process.exit(1)
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)
const presences = new Presences(client)

const demoUsers = [
  {
    id: 'alice',
    email: 'alice@appchat.demo',
    name: 'Alice',
    location: { lat: 37.7749, lng: -122.4194 },
  },
  {
    id: 'bob',
    email: 'bob@appchat.demo',
    name: 'Bob',
    location: { lat: 40.7128, lng: -74.006 },
  },
]

async function ignoreConflict(work, label) {
  try {
    const result = await work()
    console.log(`created ${label}`)
    return result
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      console.log(`exists  ${label}`)
      return null
    }
    throw err
  }
}

function avatarUrlFor(name) {
  const encoded = encodeURIComponent(name)
  return `${endpoint}/avatars/initials?name=${encoded}&project=${projectId}`
}

async function ensureUser(user) {
  const existing = await users.get({ userId: user.id }).catch((err) => {
    if (err instanceof AppwriteException && err.code === 404) return null
    throw err
  })

  if (existing) {
    console.log(`exists  user ${user.email}`)
    return existing
  }

  return users
    .create({
      userId: user.id,
      email: user.email,
      password,
      name: user.name,
    })
    .then((created) => {
      console.log(`created user ${user.email}`)
      return created
    })
}

async function ensureFriendship(a, b) {
  const [userA, userB] = [a.id, b.id].sort()
  await ignoreConflict(
    () =>
      tablesDB.createRow({
        databaseId,
        tableId: 'friendships',
        rowId: `${userA}-${userB}`,
        data: { userA, userB },
        permissions: [
          Permission.read(Role.user(userA)),
          Permission.read(Role.user(userB)),
          Permission.delete(Role.user(userA)),
          Permission.delete(Role.user(userB)),
        ],
      }),
    `friendship ${userA}/${userB}`,
  )
}

async function clearPendingRequestsBetween(a, b) {
  const result = await tablesDB.listRows({
    databaseId,
    tableId: 'friendRequests',
    queries: [
      Query.or([
        Query.and([
          Query.equal('fromUserId', a.id),
          Query.equal('toUserId', b.id),
        ]),
        Query.and([
          Query.equal('fromUserId', b.id),
          Query.equal('toUserId', a.id),
        ]),
      ]),
      Query.limit(100),
    ],
  })

  await Promise.all(
    result.rows.map((row) =>
      tablesDB.deleteRow({
        databaseId,
        tableId: 'friendRequests',
        rowId: row.$id,
      }),
    ),
  )

  if (result.rows.length > 0) {
    console.log(`deleted ${result.rows.length} stale friend request(s)`)
  }
}

async function seedPresence(user) {
  await presences.upsert({
    presenceId: user.id,
    userId: user.id,
    status: 'online',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      ...user.location,
      displayName: user.name,
      avatarUrl: avatarUrlFor(user.name),
    },
    permissions: [
      Permission.read(Role.users()),
      Permission.update(Role.user(user.id)),
      Permission.delete(Role.user(user.id)),
    ],
  })
  console.log(`upserted presence ${user.name}`)
}

for (const user of demoUsers) {
  await ensureUser(user)
}

await clearPendingRequestsBetween(demoUsers[0], demoUsers[1])
await ensureFriendship(demoUsers[0], demoUsers[1])

for (const user of demoUsers) {
  await seedPresence(user)
}

console.log('')
console.log('Seed complete.')
console.log(`Alice: ${demoUsers[0].email}`)
console.log(`Bob:   ${demoUsers[1].email}`)
console.log(`Password: ${password}`)
