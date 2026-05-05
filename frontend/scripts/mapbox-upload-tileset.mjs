/**
 * Upload a geospatial file to Mapbox and create a vector tileset (Uploads API).
 *
 * Prerequisites:
 * - Secret token at https://account.mapbox.com/access-tokens/ with scopes:
 *   uploads:write, uploads:read (uploads:list optional)
 * - Never put sk.* tokens in VITE_* — this script loads MAPBOX_SECRET_TOKEN from .env only (Node).
 *
 * Usage (from frontend/):
 *   npm run upload:tileset -- --file ./public/data/topo_vector.zip --tileset YOUR_USER.topo_nyc
 *
 * Supported inputs per Mapbox docs include .zip shapefile, GeoJSON, MBTiles, etc.
 *
 * After processing finishes, use the tileset id in the map style / vector source:
 *   map.addSource('topo', { type: 'vector', url: 'mapbox://YOUR_USER.topo_nyc' });
 *
 * @see https://docs.mapbox.com/api/maps/uploads/
 */
import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { config } from 'dotenv'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../.env') })
config({ path: resolve(__dirname, '../.env.local') })

const MB = 1024 * 1024
const UPLOAD_URL = (username) =>
  `https://api.mapbox.com/uploads/v1/${encodeURIComponent(username)}`
const CREDENTIALS_URL = (username) =>
  `https://api.mapbox.com/uploads/v1/${encodeURIComponent(username)}/credentials`
const STATUS_URL = (username, uploadId) =>
  `https://api.mapbox.com/uploads/v1/${encodeURIComponent(username)}/${encodeURIComponent(uploadId)}`

function parseArgs(argv) {
  const out = { file: null, tileset: null, name: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--file' && argv[i + 1]) {
      out.file = argv[++i]
    } else if (a === '--tileset' && argv[i + 1]) {
      out.tileset = argv[++i]
    } else if (a === '--name' && argv[i + 1]) {
      out.name = argv[++i]
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = data?.message ?? text ?? res.statusText
    const safeUrl = url.replace(/access_token=[^&]+/gi, 'access_token=…')
    throw new Error(`${res.status} ${safeUrl}: ${msg}`)
  }
  return data
}

async function main() {
  const { file, tileset, name } = parseArgs(process.argv.slice(2))
  const token = process.env.MAPBOX_SECRET_TOKEN?.trim()
  const username = process.env.MAPBOX_USERNAME?.trim()

  if (!token?.startsWith('sk.')) {
    console.error(
      'Set MAPBOX_SECRET_TOKEN in frontend/.env to a secret token (sk.*) with uploads:write. Do not use VITE_ prefix.',
    )
    process.exit(1)
  }
  if (!username) {
    console.error('Set MAPBOX_USERNAME to your Mapbox account login (e.g. keethu-j).')
    process.exit(1)
  }
  if (!file || !tileset) {
    console.error(
      'Usage: npm run upload:tileset -- --file <path> --tileset <username.tileset_id>\n' +
        'Example: --file ./public/data/topo_vector.zip --tileset keethu-j.topo_nyc',
    )
    process.exit(1)
  }

  if (!/^[\w-]+\.[\w-]+$/.test(tileset)) {
    console.error(
      '--tileset must look like username.tileset_name (letters, numbers, - and _). Tileset id suffix max 32 chars.',
    )
    process.exit(1)
  }

  const filePath = resolve(process.cwd(), file)
  const size = statSync(filePath).size
  console.info(`Staging ${(size / MB).toFixed(2)} MB → Mapbox S3 → Uploads API`)

  const credentialsUrl = `${CREDENTIALS_URL(username)}?access_token=${encodeURIComponent(token)}`
  const credentials = await fetchJson(credentialsUrl, { method: 'POST' })

  const {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    bucket,
    key,
    url: stagedUrl,
  } = credentials

  if (!bucket || !key || !accessKeyId) {
    console.error('Unexpected credentials response:', credentials)
    process.exit(1)
  }

  const s3 = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey, sessionToken },
  })

  // Multipart for large files; single part for small
  if (size < 5 * MB) {
    const body = createReadStream(filePath)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      }),
    )
  } else {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
      },
    })
    await upload.done()
  }

  const createUrl = `${UPLOAD_URL(username)}?access_token=${encodeURIComponent(token)}`
  const createBody = {
    url: stagedUrl ?? `https://${bucket}.s3.amazonaws.com/${key}`,
    tileset,
    ...(name ? { name } : {}),
  }

  const created = await fetchJson(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })

  const uploadId = created.id
  if (!uploadId) {
    console.error('No upload id in response:', created)
    process.exit(1)
  }

  console.info(`Upload id: ${uploadId} — processing on Mapbox (this can take many minutes)…`)

  for (let i = 0; i < 400; i++) {
    const stUrl = `${STATUS_URL(username, uploadId)}?access_token=${encodeURIComponent(token)}`
    const st = await fetchJson(stUrl)
    const progress = st.progress
    if (typeof progress === 'number') {
      process.stdout.write(`\rProgress: ${(progress * 100).toFixed(1)}%   `)
    }
    if (st.error) {
      console.error('\nMapbox error:', st.error)
      process.exit(1)
    }
    if (st.complete) {
      console.info(`\nDone. Tileset: ${st.tileset}`)
      console.info(`Vector source in GL JS: mapbox://${st.tileset}`)
      process.exit(0)
    }
    await sleep(4000)
  }

  console.error('\nTimed out waiting for processing. Check status in Mapbox Studio → Tilesets.')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
