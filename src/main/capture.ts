import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import type { MediaItem } from '@shared/types'
import { captureFileName } from '@shared/naming'
import { ChunkWriter, saveBuffer } from './storage.js'
import { captureContext, captureNameBase } from './session.js'
import { getMedia, insertMedia } from './db/repos.js'
import { readSettings } from './db/settingsRepo.js'
import { accountStatus } from './google/oauth.js'
import { enqueue } from './upload/queue.js'
import { log } from './log.js'

/**
 * Gravação das capturas em disco.
 *
 * Foto vai de uma vez. Vídeo vai em pedaços, conforme o navegador entrega —
 * assim uma gravação longa nunca fica acumulada na memória, e uma queda de
 * energia no meio deixa em disco tudo o que já havia sido gravado.
 */

interface VideoSession {
  writer: ChunkWriter
  examId: number
  startedAt: number
  width: number | null
  height: number | null
}

const videoSessions = new Map<string, VideoSession>()

export async function savePhoto(input: {
  bytes: Uint8Array
  width?: number
  height?: number
  /** Sufixo opcional no nome, ex.: `_anotada`. */
  suffix?: string
  /** Mídia original, quando esta é uma cópia anotada. */
  annotatedFrom?: number
  extension?: string
}): Promise<MediaItem> {
  const context = captureContext()
  const fileName = captureFileName(
    captureNameBase(context),
    input.extension ?? 'jpg',
    new Date(),
    input.suffix ?? ''
  )

  const saved = saveBuffer(context.exam.folder, fileName, input.bytes)

  const media = insertMedia({
    examId: context.exam.id,
    kind: 'photo',
    filePath: saved.filePath,
    fileName: saved.fileName,
    width: input.width ?? null,
    height: input.height ?? null,
    bytes: saved.bytes,
    annotatedFrom: input.annotatedFrom ?? null
  })

  log.info('foto salva', { arquivo: saved.fileName, bytes: saved.bytes })
  return queueIfAutoUpload(media)
}

/**
 * Manda para a fila do Drive, se o envio automático estiver ligado. O arquivo
 * já está em disco a esta altura — a nuvem é cópia, nunca o original.
 */
function queueIfAutoUpload(media: MediaItem): MediaItem {
  if (!readSettings().driveAutoUpload) return media
  const status = accountStatus()
  if (!status.configured || !status.connected) return media

  enqueue(media.id)
  return getMedia(media.id) ?? media
}

export async function startVideo(input: {
  extension: string
  width?: number
  height?: number
}): Promise<{ sessionId: string; filePath: string }> {
  const context = captureContext()
  const fileName = captureFileName(captureNameBase(context), input.extension, new Date())
  const writer = await ChunkWriter.create(context.exam.folder, fileName)

  const sessionId = randomUUID()
  videoSessions.set(sessionId, {
    writer,
    examId: context.exam.id,
    startedAt: Date.now(),
    width: input.width ?? null,
    height: input.height ?? null
  })

  log.info('gravação iniciada', { arquivo: writer.fileName })
  return { sessionId, filePath: writer.filePath }
}

export async function appendVideo(sessionId: string, chunk: Uint8Array): Promise<number> {
  const session = videoSessions.get(sessionId)
  if (!session) throw new Error('Esta gravação já foi encerrada.')
  await session.writer.write(chunk)
  return session.writer.bytesWritten
}

export async function finishVideo(sessionId: string): Promise<MediaItem> {
  const session = videoSessions.get(sessionId)
  if (!session) throw new Error('Esta gravação já foi encerrada.')
  videoSessions.delete(sessionId)

  const saved = await session.writer.close()
  const media = insertMedia({
    examId: session.examId,
    kind: 'video',
    filePath: saved.filePath,
    fileName: saved.fileName,
    width: session.width,
    height: session.height,
    durationMs: Date.now() - session.startedAt,
    bytes: saved.bytes
  })

  log.info('gravação encerrada', { arquivo: saved.fileName, bytes: saved.bytes })
  return queueIfAutoUpload(media)
}

/** Cancela uma gravação e apaga o arquivo parcial. */
export async function abortVideo(sessionId: string): Promise<void> {
  const session = videoSessions.get(sessionId)
  if (!session) return
  videoSessions.delete(sessionId)

  const saved = await session.writer.close()
  await rm(saved.filePath, { force: true })
  log.info('gravação cancelada', { arquivo: saved.fileName })
}

/**
 * Fecha o que estiver aberto quando o app é encerrado. O arquivo já gravado é
 * preservado e registrado, em vez de virar um arquivo solto sem dono.
 */
export async function closeOpenVideoSessions(): Promise<void> {
  const ids = [...videoSessions.keys()]
  for (const id of ids) {
    try {
      await finishVideo(id)
    } catch (err) {
      log.warn('falha ao encerrar gravação pendente', err)
    }
  }
}
