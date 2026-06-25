// Backblaze B2 via API HTTP nativa
// Variáveis necessárias: B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME

const B2_API_URL = 'https://api.backblazeb2.com/b2api/v2'

interface B2AuthResponse {
  authorizationToken: string
  apiUrl: string
  downloadUrl: string
}

interface B2UploadUrlResponse {
  uploadUrl: string
  authorizationToken: string
}

interface B2UploadResponse {
  fileId: string
  fileName: string
}

interface B2Bucket {
  bucketId: string
  bucketName: string
}

// Cache de autenticação (renova a cada 23h)
let cachedAuth: B2AuthResponse | null = null
let cachedBucketId: string | null = null
let authExpiry = 0

async function authorizeAccount(): Promise<B2AuthResponse> {
  if (cachedAuth && Date.now() < authExpiry) return cachedAuth

  const credentials = Buffer.from(
    `${process.env.B2_KEY_ID}:${process.env.B2_APPLICATION_KEY}`
  ).toString('base64')

  const res = await fetch(`${B2_API_URL}/b2_authorize_account`, {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`B2 auth falhou: ${err}`)
  }

  cachedAuth = await res.json()
  cachedBucketId = null // reseta o bucket ID ao re-autenticar
  authExpiry = Date.now() + 23 * 60 * 60 * 1000
  return cachedAuth!
}

async function getBucketId(): Promise<string> {
  if (cachedBucketId) return cachedBucketId

  const auth = await authorizeAccount()

  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketName: process.env.B2_BUCKET_NAME }),
  })

  if (!res.ok) throw new Error(`B2 list_buckets falhou: ${res.statusText}`)

  const { buckets }: { buckets: B2Bucket[] } = await res.json()
  const bucket = buckets.find((b) => b.bucketName === process.env.B2_BUCKET_NAME)

  if (!bucket) throw new Error(`Bucket "${process.env.B2_BUCKET_NAME}" não encontrado no B2`)

  cachedBucketId = bucket.bucketId
  return cachedBucketId
}

export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ fileId: string; fileName: string; downloadUrl: string }> {
  const [auth, bucketId] = await Promise.all([authorizeAccount(), getBucketId()])

  const urlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketId }),
  })

  if (!urlRes.ok) throw new Error(`B2 get_upload_url falhou: ${urlRes.statusText}`)
  const uploadData: B2UploadUrlResponse = await urlRes.json()

  const { createHash } = await import('crypto')
  const sha1 = createHash('sha1').update(buffer).digest('hex')

  const uploadRes = await fetch(uploadData.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadData.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'X-Bz-Content-Sha1': sha1,
    },
    body: buffer as unknown as BodyInit,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`B2 upload falhou: ${err}`)
  }

  const result: B2UploadResponse = await uploadRes.json()

  return {
    fileId: result.fileId,
    fileName: result.fileName,
    downloadUrl: `${auth.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}`,
  }
}

export async function getSignedDownloadUrl(
  fileName: string,
  validDurationSeconds = 600
): Promise<string> {
  const [auth, bucketId] = await Promise.all([authorizeAccount(), getBucketId()])

  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds: validDurationSeconds,
    }),
  })

  if (!res.ok) throw new Error(`B2 download auth falhou: ${res.statusText}`)
  const { authorizationToken } = await res.json()

  return `${auth.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${fileName}?Authorization=${authorizationToken}`
}

export async function deleteFile(fileId: string, fileName: string): Promise<void> {
  const auth = await authorizeAccount()

  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileId, fileName }),
  })

  if (!res.ok) throw new Error(`B2 delete falhou: ${res.statusText}`)
}

export async function downloadFileById(
  fileId: string
): Promise<{ content: Buffer; contentType: string; fileName: string }> {
  const auth = await authorizeAccount()

  const res = await fetch(
    `${auth.downloadUrl}/b2api/v2/b2_download_file_by_id?fileId=${encodeURIComponent(fileId)}`,
    { headers: { Authorization: auth.authorizationToken } }
  )

  if (!res.ok) throw new Error(`B2 download falhou: ${res.statusText}`)

  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream'
  const rawFileName = res.headers.get('X-Bz-File-Name') ?? 'arquivo'
  const fileName = decodeURIComponent(rawFileName).split('/').pop() ?? rawFileName
  const arrayBuffer = await res.arrayBuffer()

  return { content: Buffer.from(arrayBuffer), contentType, fileName }
}

export function generateFileName(prefix: string, originalName: string): string {
  const timestamp = Date.now()
  const ext = originalName.split('.').pop() ?? 'bin'
  const safe = originalName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40)
  return `${prefix}_${safe}_${timestamp}.${ext}`
}
