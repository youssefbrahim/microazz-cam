import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { dirname } from 'node:path'
import type {
  AppInfo,
  CameraPreset,
  CameraPresetData,
  CaptureContextInfo,
  Exam,
  MediaItem,
  Patient,
  Settings,
  UploadStatus
} from '@shared/types'
import { readSettings, writeSettings } from './db/settingsRepo.js'
import { sqliteVersion } from './db/connection.js'
import { diskSpace, mediaRoot } from './storage.js'
import { logFilePath, log } from './log.js'
import { userDataDir } from './paths.js'
import { captureContext, setActiveExam } from './session.js'
import { appendVideo, abortVideo, finishVideo, savePhoto, startVideo } from './capture.js'
import {
  createExam,
  createPatient,
  deleteMediaRow,
  deletePatient,
  examMediaCounts,
  getMedia,
  listAllExams,
  listExams,
  listMedia,
  listPatients,
  listRecentMedia,
  updatePatient
} from './db/repos.js'
import { deletePreset, listPresets, readAutoPreset, savePreset } from './db/presetsRepo.js'
import { applyGlobalShortcuts, readShortcuts, writeShortcuts } from './shortcuts.js'
import type { ShortcutBinding } from '@shared/shortcuts'
import { signIn, signOut } from './google/oauth.js'
import { enqueue, queueStatus, retryAllFailed, scheduleRun } from './upload/queue.js'
import { writeAndRevealDiagnostics } from './diagnostics.js'
import { installUpdateNow } from './updater.js'

/**
 * Todos os canais entre a interface e o processo principal ficam registrados
 * aqui. A interface nunca toca em disco, banco ou rede diretamente.
 */
export function registerIpc(): void {
  // --- App ---

  ipcMain.handle('app:info', (): AppInfo => {
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chromium: process.versions.chrome,
      sqlite: sqliteVersion(),
      userDataPath: userDataDir(),
      mediaRoot: mediaRoot(),
      platform: process.platform
    }
  })

  ipcMain.handle('app:openPath', async (_event, target: string): Promise<void> => {
    if (typeof target !== 'string' || !target) return
    await shell.openPath(target)
  })

  ipcMain.handle('app:revealPath', (_event, target: string): void => {
    if (typeof target !== 'string' || !target) return
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:openLogsFolder', async (): Promise<void> => {
    await shell.openPath(dirname(logFilePath()))
  })

  ipcMain.handle('app:diagnostics', (): Promise<string> => writeAndRevealDiagnostics())

  ipcMain.handle('app:installUpdate', async (event): Promise<void> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) await installUpdateNow(window)
  })

  ipcMain.handle('app:toggleFullscreen', (event): boolean => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    const next = !window.isFullScreen()
    window.setFullScreen(next)
    return next
  })

  ipcMain.handle('app:isFullscreen', (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  // --- Configurações ---

  ipcMain.handle('settings:read', (): Settings => readSettings())

  ipcMain.handle('settings:write', (_event, patch: Partial<Settings>): Settings => {
    log.info('configurações alteradas', Object.keys(patch ?? {}))
    return writeSettings(patch ?? {})
  })

  ipcMain.handle('storage:diskSpace', () => diskSpace())

  /**
   * Deixa o usuário escolher outra pasta para as capturas. Importante porque a
   * pasta Documentos costuma estar redirecionada para o OneDrive, e vídeos de
   * exame subindo sozinhos para a nuvem raramente é o que a clínica quer.
   */
  ipcMain.handle('storage:chooseMediaRoot', async (event): Promise<string | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Escolha a pasta onde as fotos e vídeos serão gravados',
      defaultPath: mediaRoot(),
      properties: ['openDirectory', 'createDirectory']
    }

    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null

    const chosen = result.filePaths[0]
    writeSettings({ mediaRoot: chosen })
    log.info('pasta das capturas alterada', { chosen })
    return chosen
  })

  // --- Paciente/exame ativos ---

  ipcMain.handle('session:current', (): CaptureContextInfo => describeContext())

  ipcMain.handle('session:setExam', (_event, examId: number | null): CaptureContextInfo => {
    setActiveExam(examId)
    return describeContext()
  })

  // --- Captura ---

  ipcMain.handle(
    'capture:photo',
    (
      _event,
      input: { bytes: Uint8Array; width?: number; height?: number; suffix?: string; annotatedFrom?: number }
    ): Promise<MediaItem> => savePhoto(input)
  )

  ipcMain.handle(
    'capture:videoStart',
    (_event, input: { extension: string; width?: number; height?: number }) => startVideo(input)
  )

  ipcMain.handle(
    'capture:videoChunk',
    (_event, sessionId: string, chunk: Uint8Array): Promise<number> =>
      appendVideo(sessionId, chunk)
  )

  ipcMain.handle(
    'capture:videoFinish',
    (_event, sessionId: string): Promise<MediaItem> => finishVideo(sessionId)
  )

  ipcMain.handle(
    'capture:videoAbort',
    (_event, sessionId: string): Promise<void> => abortVideo(sessionId)
  )

  // --- Google Drive ---

  ipcMain.handle('drive:status', (): UploadStatus => queueStatus())

  ipcMain.handle('drive:signIn', async (): Promise<UploadStatus> => {
    await signIn()
    scheduleRun(300)
    return queueStatus()
  })

  ipcMain.handle('drive:signOut', async (): Promise<UploadStatus> => {
    await signOut()
    return queueStatus()
  })

  ipcMain.handle('drive:retryFailed', (): UploadStatus => {
    retryAllFailed()
    return queueStatus()
  })

  /** Envia uma mídia específica, mesmo com o envio automático desligado. */
  ipcMain.handle('drive:enqueue', (_event, mediaId: number): UploadStatus => {
    enqueue(mediaId)
    return queueStatus()
  })

  // --- Atalhos ---

  ipcMain.handle('shortcuts:read', (): ShortcutBinding[] => readShortcuts())

  ipcMain.handle(
    'shortcuts:write',
    (event, bindings: ShortcutBinding[]): { bindings: ShortcutBinding[]; failed: string[] } => {
      const saved = writeShortcuts(bindings ?? [])
      const failed = applyGlobalShortcuts(BrowserWindow.fromWebContents(event.sender))
      return { bindings: saved, failed }
    }
  )

  // --- Pacientes ---

  ipcMain.handle('patients:list', (_event, search?: string): Patient[] => listPatients(search ?? ''))

  ipcMain.handle(
    'patients:create',
    (
      _event,
      input: { name: string; document?: string | null; birthDate?: string | null; notes?: string | null }
    ): Patient => createPatient(input)
  )

  ipcMain.handle(
    'patients:update',
    (
      _event,
      id: number,
      patch: { name?: string; document?: string | null; birthDate?: string | null; notes?: string | null }
    ): Patient => updatePatient(id, patch)
  )

  ipcMain.handle('patients:delete', (_event, id: number): void => deletePatient(id))

  // --- Exames ---

  ipcMain.handle('exams:list', (_event, patientId: number): Exam[] => listExams(patientId))

  ipcMain.handle(
    'exams:create',
    (_event, input: { patientId: number; title?: string; notes?: string | null }): Exam =>
      createExam(input)
  )

  ipcMain.handle('exams:counts', (_event, patientId: number) => examMediaCounts(patientId))

  // --- Predefinições de imagem ---

  ipcMain.handle('presets:list', (_event, cameraLabel: string): CameraPreset[] =>
    listPresets(cameraLabel ?? '')
  )

  ipcMain.handle('presets:readAuto', (_event, cameraLabel: string): CameraPreset | null =>
    readAutoPreset(cameraLabel ?? '')
  )

  ipcMain.handle(
    'presets:save',
    (_event, cameraLabel: string, name: string, data: CameraPresetData): CameraPreset =>
      savePreset(cameraLabel ?? '', name ?? '', data)
  )

  ipcMain.handle('presets:delete', (_event, id: number): void => deletePreset(id))

  // --- Mídias ---

  ipcMain.handle('media:recent', (_event, limit?: number): MediaItem[] => listRecentMedia(limit))

  ipcMain.handle('media:forExam', (_event, examId: number): MediaItem[] => listMedia(examId))

  ipcMain.handle('media:allExams', () => listAllExams())

  /**
   * Exclui a mídia. Manda o arquivo para a Lixeira em vez de apagar de vez —
   * é registro clínico, e um clique errado precisa ter volta.
   */
  ipcMain.handle('media:delete', async (_event, id: number): Promise<void> => {
    const media = getMedia(id)
    if (!media) return
    try {
      await shell.trashItem(media.filePath)
    } catch (err) {
      log.warn('não foi possível mandar o arquivo para a Lixeira', err)
    }
    deleteMediaRow(id)
    log.info('mídia excluída', { arquivo: media.fileName })
  })

}

function describeContext(): CaptureContextInfo {
  const { exam, patient } = captureContext()
  return {
    examId: exam.id,
    examTitle: exam.title,
    examDate: exam.examDate,
    folder: exam.folder,
    patientId: patient.id,
    patientName: patient.name,
    isLoose: patient.isSystem
  }
}
