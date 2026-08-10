import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  CameraPreset,
  CameraPresetData,
  CaptureContextInfo,
  DiskSpace,
  Exam,
  MediaItem,
  Patient,
  Settings,
  UploadStatus
} from '@shared/types'
import type { ShortcutAction, ShortcutBinding } from '@shared/shortcuts'

/** Dispositivo HID oferecido pelo Windows na escolha do pedal. */
export interface HidDeviceInfo {
  deviceId: string
  name: string
  vendorId: number
  productId: number
}

/**
 * Ponte entre a interface e o processo principal.
 *
 * A interface roda isolada (sem acesso a Node) e só enxerga exatamente as
 * funções listadas aqui. Cada uma delas vira uma mensagem para o `ipc.ts`.
 */
const api = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
    /** Abre uma pasta ou arquivo no programa padrão do Windows. */
    openPath: (target: string): Promise<void> => ipcRenderer.invoke('app:openPath', target),
    /** Abre o Explorer já com o arquivo selecionado. */
    revealPath: (target: string): Promise<void> => ipcRenderer.invoke('app:revealPath', target),
    openLogsFolder: (): Promise<void> => ipcRenderer.invoke('app:openLogsFolder'),
    /** Alterna tela cheia. Devolve o novo estado. */
    toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:toggleFullscreen'),
    isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:isFullscreen'),
    /** Avisa quando a janela entra ou sai da tela cheia, inclusive pelo F11. */
    onFullscreen: (handler: (value: boolean) => void): (() => void) => {
      const listener = (_event: unknown, value: boolean): void => handler(value)
      ipcRenderer.on('window:fullscreen', listener)
      return () => ipcRenderer.off('window:fullscreen', listener)
    },
    /** Gera o relatório de diagnóstico na Área de Trabalho. Devolve o caminho. */
    diagnostics: (): Promise<string> => ipcRenderer.invoke('app:diagnostics'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('app:installUpdate'),
    /** Avisa quando uma atualização terminou de baixar. */
    onUpdateReady: (handler: (version: string) => void): (() => void) => {
      const listener = (_event: unknown, version: string): void => handler(version)
      ipcRenderer.on('update:ready', listener)
      return () => ipcRenderer.off('update:ready', listener)
    }
  },

  settings: {
    read: (): Promise<Settings> => ipcRenderer.invoke('settings:read'),
    write: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:write', patch)
  },

  storage: {
    diskSpace: (): Promise<DiskSpace> => ipcRenderer.invoke('storage:diskSpace'),
    /** Abre o seletor de pastas do Windows. Devolve null se o usuário cancelar. */
    chooseMediaRoot: (): Promise<string | null> => ipcRenderer.invoke('storage:chooseMediaRoot')
  },

  session: {
    current: (): Promise<CaptureContextInfo> => ipcRenderer.invoke('session:current'),
    setExam: (examId: number | null): Promise<CaptureContextInfo> =>
      ipcRenderer.invoke('session:setExam', examId)
  },

  capture: {
    photo: (input: {
      bytes: Uint8Array
      width?: number
      height?: number
      suffix?: string
      annotatedFrom?: number
    }): Promise<MediaItem> => ipcRenderer.invoke('capture:photo', input),

    videoStart: (input: {
      extension: string
      width?: number
      height?: number
    }): Promise<{ sessionId: string; filePath: string }> =>
      ipcRenderer.invoke('capture:videoStart', input),

    /** Devolve quantos bytes já foram gravados em disco. */
    videoChunk: (sessionId: string, chunk: Uint8Array): Promise<number> =>
      ipcRenderer.invoke('capture:videoChunk', sessionId, chunk),

    videoFinish: (sessionId: string): Promise<MediaItem> =>
      ipcRenderer.invoke('capture:videoFinish', sessionId),

    videoAbort: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('capture:videoAbort', sessionId)
  },

  drive: {
    status: (): Promise<UploadStatus> => ipcRenderer.invoke('drive:status'),
    /** Abre o navegador para o login do Google. */
    signIn: (): Promise<UploadStatus> => ipcRenderer.invoke('drive:signIn'),
    signOut: (): Promise<UploadStatus> => ipcRenderer.invoke('drive:signOut'),
    retryFailed: (): Promise<UploadStatus> => ipcRenderer.invoke('drive:retryFailed'),
    /** Envia uma captura específica, mesmo com o envio automático desligado. */
    send: (mediaId: number): Promise<UploadStatus> => ipcRenderer.invoke('drive:enqueue', mediaId),
    /** Avisos de progresso da fila. */
    onStatus: (handler: (status: UploadStatus) => void): (() => void) => {
      const listener = (_event: unknown, status: UploadStatus): void => handler(status)
      ipcRenderer.on('upload:status', listener)
      return () => ipcRenderer.off('upload:status', listener)
    }
  },

  shortcuts: {
    read: (): Promise<ShortcutBinding[]> => ipcRenderer.invoke('shortcuts:read'),
    /** Devolve os atalhos salvos e a lista dos que o Windows recusou. */
    write: (
      bindings: ShortcutBinding[]
    ): Promise<{ bindings: ShortcutBinding[]; failed: string[] }> =>
      ipcRenderer.invoke('shortcuts:write', bindings),
    /** Avisos vindos do processo principal quando um atalho global é acionado. */
    onTrigger: (handler: (action: ShortcutAction) => void): (() => void) => {
      const listener = (_event: unknown, action: ShortcutAction): void => handler(action)
      ipcRenderer.on('shortcut:trigger', listener)
      return () => ipcRenderer.off('shortcut:trigger', listener)
    }
  },

  hid: {
    /** Lista de dispositivos oferecida pelo Windows durante a escolha do pedal. */
    onDevices: (handler: (devices: HidDeviceInfo[]) => void): (() => void) => {
      const listener = (_event: unknown, devices: HidDeviceInfo[]): void => handler(devices)
      ipcRenderer.on('hid:devices', listener)
      return () => ipcRenderer.off('hid:devices', listener)
    },
    /** Confirma qual dispositivo usar (ou null para cancelar). */
    select: (deviceId: string | null): Promise<void> => ipcRenderer.invoke('hid:select', deviceId)
  },

  patients: {
    list: (search?: string): Promise<Patient[]> => ipcRenderer.invoke('patients:list', search),
    create: (input: {
      name: string
      document?: string | null
      birthDate?: string | null
      notes?: string | null
    }): Promise<Patient> => ipcRenderer.invoke('patients:create', input),
    update: (
      id: number,
      patch: {
        name?: string
        document?: string | null
        birthDate?: string | null
        notes?: string | null
      }
    ): Promise<Patient> => ipcRenderer.invoke('patients:update', id, patch),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('patients:delete', id)
  },

  exams: {
    list: (patientId: number): Promise<Exam[]> => ipcRenderer.invoke('exams:list', patientId),
    create: (input: { patientId: number; title?: string; notes?: string | null }): Promise<Exam> =>
      ipcRenderer.invoke('exams:create', input),
    /** Quantas fotos e vídeos cada exame do paciente tem. */
    counts: (patientId: number): Promise<Record<number, { photos: number; videos: number }>> =>
      ipcRenderer.invoke('exams:counts', patientId)
  },

  presets: {
    list: (cameraLabel: string): Promise<CameraPreset[]> =>
      ipcRenderer.invoke('presets:list', cameraLabel),
    /** Último ajuste usado nesta câmera, restaurado ao abrir o programa. */
    readAuto: (cameraLabel: string): Promise<CameraPreset | null> =>
      ipcRenderer.invoke('presets:readAuto', cameraLabel),
    save: (cameraLabel: string, name: string, data: CameraPresetData): Promise<CameraPreset> =>
      ipcRenderer.invoke('presets:save', cameraLabel, name, data),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('presets:delete', id)
  },

  media: {
    recent: (limit?: number): Promise<MediaItem[]> => ipcRenderer.invoke('media:recent', limit),
    forExam: (examId: number): Promise<MediaItem[]> => ipcRenderer.invoke('media:forExam', examId),
    /** Todos os exames, do mais recente ao mais antigo, com o nome do paciente. */
    allExams: (): Promise<Array<Exam & { patientName: string; isSystem: boolean }>> =>
      ipcRenderer.invoke('media:allExams'),
    /** Manda o arquivo para a Lixeira e apaga o registro. */
    remove: (id: number): Promise<void> => ipcRenderer.invoke('media:delete', id),
    /** Endereço que a interface usa em <img>/<video> para exibir um arquivo salvo. */
    url: (filePath: string): string => `mvfile://media/?p=${encodeURIComponent(filePath)}`
  }
}

export type MicroazzApi = typeof api

contextBridge.exposeInMainWorld('microazz', api)
