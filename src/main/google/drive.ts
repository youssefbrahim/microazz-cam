import { createReadStream, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { getAccessToken } from './oauth.js'
import { log } from '../log.js'

/**
 * Envio para o Google Drive.
 *
 * Porte da lógica já validada no aplicativo de celular
 * (`microvision/src/lib/drive.ts`), com duas diferenças pensadas para o
 * desktop, onde os vídeos são bem maiores:
 *
 *  • **Retomada por bytes** — se a internet cair no meio de um vídeo de 500 MB,
 *    perguntamos ao Google quanto ele já recebeu e continuamos dali, em vez de
 *    recomeçar do zero.
 *  • **Envio em fluxo** — o arquivo vai do disco para a rede sem passar inteiro
 *    pela memória.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const RESUMABLE_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable'

function mimeTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    default:
      return 'image/jpeg'
  }
}

async function findFolderId(
  name: string,
  parentId: string | undefined,
  token: string
): Promise<string | null> {
  const parts = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${name.replace(/'/g, "\\'")}'`,
    'trashed=false'
  ]
  if (parentId) parts.push(`'${parentId}' in parents`)

  const url = `${DRIVE_API}/files?q=${encodeURIComponent(parts.join(' and '))}&fields=files(id)&spaces=drive`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) return null

  const data = (await response.json()) as { files?: Array<{ id: string }> }
  return data.files?.[0]?.id ?? null
}

async function createFolderId(
  name: string,
  parentId: string | undefined,
  token: string
): Promise<string> {
  const body: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  }
  if (parentId) body.parents = [parentId]

  const response = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = (await response.json()) as { id?: string; error?: { message?: string } }
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message ?? 'Falha ao criar a pasta no Drive.')
  }
  return data.id
}

/**
 * Encontra (ou cria) uma pasta pelo nome. Com o escopo restrito `drive.file`,
 * a busca só enxerga pastas que este programa criou — se o usuário apagar a
 * pasta no Drive, uma nova é criada, e é o comportamento desejado.
 */
async function resolveFolder(
  name: string,
  parentId: string | undefined,
  token: string
): Promise<string | undefined> {
  const clean = name.trim()
  if (!clean) return parentId
  return (await findFolderId(clean, parentId, token)) ?? (await createFolderId(clean, parentId, token))
}

/** Monta `Microazz Cam / <Paciente> / <Exame>` e devolve o id da pasta final. */
export async function resolveExamFolder(
  baseFolder: string,
  patientName: string,
  examFolderName: string
): Promise<string | undefined> {
  const token = await getAccessToken()
  const baseId = await resolveFolder(baseFolder || 'Microazz Cam', undefined, token)
  const patientId = patientName ? await resolveFolder(patientName, baseId, token) : baseId
  return examFolderName ? await resolveFolder(examFolderName, patientId, token) : patientId
}

export interface UploadTarget {
  filePath: string
  folderId: string | undefined
  /** Sessão já iniciada, para retomar um envio interrompido. */
  sessionUri?: string
  onProgress?: (bytesSent: number, total: number) => void
}

export interface UploadResult {
  fileId: string
  sessionUri: string
  bytesSent: number
}

/** Abre uma sessão de envio e devolve o endereço para onde mandar os bytes. */
async function startSession(filePath: string, folderId: string | undefined): Promise<string> {
  const token = await getAccessToken()
  const mimeType = mimeTypeFor(filePath)

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: basename(filePath),
    mimeType
  }
  if (folderId) metadata.parents = [folderId]

  const response = await fetch(RESUMABLE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType
    },
    body: JSON.stringify(metadata)
  })

  if (!response.ok) {
    throw new Error(`Falha ao iniciar o envio ao Drive (${response.status}). ${await response.text()}`)
  }

  const sessionUri = response.headers.get('location')
  if (!sessionUri) throw new Error('O Drive não informou o endereço de envio.')
  return sessionUri
}

/**
 * Pergunta ao Google quantos bytes ele já recebeu desta sessão.
 * Devolve -1 se a sessão não vale mais (expirou ou foi cancelada).
 */
async function askBytesReceived(sessionUri: string, totalBytes: number): Promise<number> {
  const token = await getAccessToken()
  const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Range': `bytes */${totalBytes}`,
      'Content-Length': '0'
    }
  })

  // 200/201 = já terminou.
  if (response.ok) return totalBytes

  // 308 = continue de onde parou; o cabeçalho Range diz até onde chegou.
  if (response.status === 308) {
    const range = response.headers.get('range')
    if (!range) return 0
    const end = Number(range.split('-')[1])
    return Number.isFinite(end) ? end + 1 : 0
  }

  return -1
}

/**
 * Envia o arquivo. Se `sessionUri` for informado, retoma o envio anterior a
 * partir do primeiro byte que o Google ainda não recebeu.
 */
export async function uploadFile(target: UploadTarget): Promise<UploadResult> {
  const totalBytes = statSync(target.filePath).size
  const mimeType = mimeTypeFor(target.filePath)

  let sessionUri = target.sessionUri ?? ''
  let offset = 0

  if (sessionUri) {
    const received = await askBytesReceived(sessionUri, totalBytes)
    if (received < 0) {
      log.info('sessão de envio expirou; recomeçando', { arquivo: basename(target.filePath) })
      sessionUri = ''
    } else if (received >= totalBytes) {
      // Já tinha subido inteiro; falta só confirmar o id do arquivo.
      offset = totalBytes
    } else {
      offset = received
      log.info('retomando envio', { arquivo: basename(target.filePath), de: offset, de_total: totalBytes })
    }
  }

  if (!sessionUri) {
    sessionUri = await startSession(target.filePath, target.folderId)
    offset = 0
  }

  const token = await getAccessToken()
  const remaining = totalBytes - offset

  // Arquivo vazio: o Drive aceita, mas o Content-Range tem forma própria.
  const contentRange =
    totalBytes === 0
      ? `bytes */0`
      : `bytes ${offset}-${totalBytes - 1}/${totalBytes}`

  // O arquivo vai em fluxo, do disco direto para a rede: um vídeo de 2 GB nunca
  // precisa caber na memória.
  const body = remaining > 0 ? createReadStream(target.filePath, { start: offset }) : undefined

  const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
      'Content-Range': contentRange,
      'Content-Length': String(Math.max(remaining, 0))
    },
    body,
    // Exigido pelo Node para enviar um corpo em fluxo.
    duplex: 'half'
  } as unknown as RequestInit)

  if (!response.ok) {
    throw new Error(`Falha ao enviar ao Drive (código ${response.status}). ${await response.text()}`)
  }

  const data = (await response.json()) as { id?: string }
  target.onProgress?.(totalBytes, totalBytes)

  return { fileId: data.id ?? '', sessionUri, bytesSent: totalBytes }
}
