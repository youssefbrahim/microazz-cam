import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { BrowserWindow, net } from 'electron'
import type { DriveStatus, UploadStatus } from '@shared/types'
import { getDatabase, queryAll, queryOne } from '../db/connection.js'
import { getExam, getMedia, getPatient } from '../db/repos.js'
import { readSettings } from '../db/settingsRepo.js'
import { accountStatus } from '../google/oauth.js'
import { resolveExamFolder, uploadFile } from '../google/drive.js'
import { log } from '../log.js'

/**
 * Fila de envio ao Drive.
 *
 * A fila mora no banco, não na memória: se faltar luz no meio de um envio, ao
 * reabrir o programa ele continua de onde parou. Cada tentativa que falha espera
 * um pouco mais que a anterior, para não martelar a rede nem a API do Google
 * quando a internet está instável.
 */

/** Espera antes de cada nova tentativa: 15s, 1min, 5min, 15min, 1h. */
const BACKOFF_SECONDS = [15, 60, 300, 900, 3600]

interface QueueRow {
  id: number
  media_id: number
  state: 'pending' | 'uploading' | 'done' | 'error'
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  session_uri: string | null
  bytes_sent: number
}

let running = false
let timer: ReturnType<typeof setTimeout> | null = null
let mainWindow: BrowserWindow | null = null

export function attachWindow(window: BrowserWindow): void {
  mainWindow = window
}

/** Põe uma mídia na fila. Ignora se ela já estiver lá. */
export function enqueue(mediaId: number): void {
  getDatabase()
    .prepare(
      'INSERT INTO upload_queue (media_id, state, created_at) VALUES (?, ?, ?) ' +
        "ON CONFLICT (media_id) DO UPDATE SET state = 'pending', next_attempt_at = NULL, last_error = NULL"
    )
    .run(mediaId, 'pending', new Date().toISOString())

  setDriveStatus(mediaId, 'pending')
  notifyRenderer()
  scheduleRun(500)
}

/** Reenfileira tudo o que falhou, ignorando a espera. */
export function retryAllFailed(): void {
  getDatabase()
    .prepare(
      "UPDATE upload_queue SET state = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL " +
        "WHERE state = 'error'"
    )
    .run()
  getDatabase().prepare("UPDATE media SET drive_status = 'pending' WHERE drive_status = 'error'").run()
  notifyRenderer()
  scheduleRun(200)
}

export function removeFromQueue(mediaId: number): void {
  getDatabase().prepare('DELETE FROM upload_queue WHERE media_id = ?').run(mediaId)
  notifyRenderer()
}

function setDriveStatus(mediaId: number, status: DriveStatus, fileId?: string): void {
  getDatabase()
    .prepare('UPDATE media SET drive_status = ?, drive_file_id = COALESCE(?, drive_file_id) WHERE id = ?')
    .run(status, fileId ?? null, mediaId)
}

export function queueStatus(): UploadStatus {
  const counts = queryAll<{ state: string; total: number }>(
    'SELECT state, COUNT(*) AS total FROM upload_queue GROUP BY state'
  )
  const byState = Object.fromEntries(counts.map((row) => [row.state, row.total]))
  const account = accountStatus()

  return {
    connected: account.connected,
    configured: account.configured,
    email: account.email,
    pending: (byState.pending ?? 0) + (byState.uploading ?? 0),
    uploading: byState.uploading ?? 0,
    failed: byState.error ?? 0,
    done: byState.done ?? 0,
    running
  }
}

function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('upload:status', queueStatus())
  }
}

/** Próximo item cuja hora de tentar já chegou. */
function nextReady(): QueueRow | null {
  return queryOne<QueueRow>(
    "SELECT * FROM upload_queue WHERE state IN ('pending','uploading') " +
      'AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY id LIMIT 1',
    new Date().toISOString()
  )
}

export function scheduleRun(delayMs = 0): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void runQueue()
  }, delayMs)
}

export async function runQueue(): Promise<void> {
  if (running) return

  const account = accountStatus()
  if (!account.configured || !account.connected) return
  if (!readSettings().driveAutoUpload) return

  // Sem rede, nem vale tentar: economiza tentativas e mantém a espera curta.
  if (!net.isOnline()) {
    scheduleRun(30_000)
    return
  }

  running = true
  notifyRenderer()

  try {
    let item = nextReady()
    while (item) {
      await processItem(item)
      item = nextReady()
    }
  } finally {
    running = false
    notifyRenderer()
  }

  // Ainda há itens esperando a hora de tentar de novo?
  const waiting = queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM upload_queue WHERE state IN ('pending','uploading')"
  )
  if ((waiting?.total ?? 0) > 0) scheduleRun(30_000)
}

async function processItem(item: QueueRow): Promise<void> {
  const media = getMedia(item.media_id)

  // O arquivo foi apagado ou o registro sumiu: tira da fila em silêncio.
  if (!media || !existsSync(media.filePath)) {
    getDatabase().prepare('DELETE FROM upload_queue WHERE id = ?').run(item.id)
    return
  }

  markUploading(item.id, media.id)

  try {
    const exam = getExam(media.examId)
    const patient = exam ? getPatient(exam.patientId) : null
    const settings = readSettings()

    const folderId = await resolveExamFolder(
      settings.driveFolderName,
      patient && !patient.isSystem ? patient.name : '',
      exam ? basename(exam.folder) : ''
    )

    const result = await uploadFile({
      filePath: media.filePath,
      folderId,
      sessionUri: item.session_uri ?? undefined
    })

    getDatabase()
      .prepare("UPDATE upload_queue SET state = 'done', bytes_sent = ?, last_error = NULL WHERE id = ?")
      .run(result.bytesSent, item.id)
    setDriveStatus(media.id, 'uploaded', result.fileId)

    log.info('enviado ao Drive', { arquivo: media.fileName })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const attempts = item.attempts + 1
    const wait = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
    const nextAt = new Date(Date.now() + wait * 1000).toISOString()

    // Depois de esgotar as esperas, o item para e espera o "reenviar" do usuário.
    const exhausted = attempts > BACKOFF_SECONDS.length

    getDatabase()
      .prepare(
        'UPDATE upload_queue SET state = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?'
      )
      .run(exhausted ? 'error' : 'pending', attempts, exhausted ? null : nextAt, message, item.id)

    setDriveStatus(media.id, exhausted ? 'error' : 'pending')
    log.warn('falha ao enviar ao Drive', { arquivo: media.fileName, tentativa: attempts, message })

    // Erro de autorização não melhora com tentativa: para a fila agora.
    if (message.includes('autorização') || message.includes('Nenhuma conta')) {
      throw err
    }
  }

  notifyRenderer()
}

function markUploading(queueId: number, mediaId: number): void {
  getDatabase().prepare("UPDATE upload_queue SET state = 'uploading' WHERE id = ?").run(queueId)
  setDriveStatus(mediaId, 'uploading')
  notifyRenderer()
}

/**
 * Ao abrir o programa, o que ficou marcado como "enviando" na sessão anterior
 * volta para "pendente" — senão ficaria travado para sempre.
 */
export function recoverInterrupted(): void {
  getDatabase().prepare("UPDATE upload_queue SET state = 'pending' WHERE state = 'uploading'").run()
  getDatabase()
    .prepare("UPDATE media SET drive_status = 'pending' WHERE drive_status = 'uploading'")
    .run()
}
