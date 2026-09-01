/**
 * Tipos compartilhados entre o processo principal (Node) e a interface (React).
 * Este arquivo é a "fonte da verdade" do contrato entre as duas metades do app.
 */

export interface AppInfo {
  appVersion: string
  electron: string
  node: string
  chromium: string
  sqlite: string
  /** Caminho onde ficam banco, logs e configurações. */
  userDataPath: string
  /** Pasta raiz onde as capturas são gravadas (Documentos\Microazz Cam). */
  mediaRoot: string
  platform: string
}

/** Configurações do app. Persistem na tabela `settings` do banco. */
export interface Settings {
  /** Pasta raiz das capturas. Vazio = padrão (Documentos\Microazz Cam). */
  mediaRoot: string
  /** deviceId da última câmera usada (pode mudar ao reconectar o USB). */
  cameraDeviceId: string
  /** Nome da câmera — usado para reconectar quando o deviceId muda. */
  cameraLabel: string
  /** Resolução preferida; 0 = a maior que a câmera oferecer. */
  cameraWidth: number
  cameraHeight: number
  /** Qualidade do JPEG das fotos (0,3 a 1,0). */
  photoQuality: number
  /** Gravar áudio do microfone junto com o vídeo. */
  recordAudio: boolean
  /** deviceId do microfone escolhido. */
  audioDeviceId: string
  /** Espelhamento e rotação — o microscópio costuma inverter a imagem. */
  flipHorizontal: boolean
  flipVertical: boolean
  rotation: 0 | 90 | 180 | 270
  /**
   * Ajustes feitos por software, usados quando a câmera não oferece o controle
   * no próprio hardware. `1` é neutro.
   */
  swBrightness: number
  swContrast: number
  swSaturation: number
  /** Oculta o nome do paciente na tela quando há terceiros na sala. */
  privacyMode: boolean
  /** Som de obturador ao fotografar. */
  shutterSound: boolean
  /**
   * Como o painel de capturas aparece na tela principal: `strip` (tira),
   * `grid` (grade) ou `hidden` (só o cabeçalho). Texto livre porque vem do
   * banco; a interface trata o desconhecido como `strip`.
   */
  overviewMode: string
  /** Intervalo (segundos) e limite do timelapse. */
  timelapseInterval: number
  timelapseLimit: number
  /**
   * Nome da pasta base no Google Drive.
   *
   * Quem também usa o aplicativo de celular pode trocar para "Microvision" em
   * Configurações, e aí as capturas do mesmo paciente ficam juntas nas duas
   * pontas.
   */
  driveFolderName: string
  /** Envio automático ao Drive assim que a captura termina. */
  driveAutoUpload: boolean
  /** Configuração do pedal, em JSON (ver `@shared/pedal`). */
  pedalConfig: string
}

export const DEFAULT_SETTINGS: Settings = {
  mediaRoot: '',
  cameraDeviceId: '',
  cameraLabel: '',
  cameraWidth: 0,
  cameraHeight: 0,
  photoQuality: 0.92,
  recordAudio: false,
  audioDeviceId: '',
  flipHorizontal: false,
  flipVertical: false,
  rotation: 0,
  swBrightness: 1,
  swContrast: 1,
  swSaturation: 1,
  privacyMode: false,
  shutterSound: true,
  overviewMode: 'strip',
  timelapseInterval: 30,
  timelapseLimit: 0,
  driveFolderName: 'Microazz Cam',
  driveAutoUpload: true,
  pedalConfig: ''
}

// --- Registros do banco ---

export interface Patient {
  id: number
  name: string
  document: string | null
  birthDate: string | null
  notes: string | null
  /** Registro interno ("Sem paciente"), que recebe as capturas avulsas. */
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface Exam {
  id: number
  patientId: number
  title: string
  examDate: string
  notes: string | null
  /** Pasta absoluta onde as capturas deste exame são gravadas. */
  folder: string
  createdAt: string
}

export type MediaKind = 'photo' | 'video'
export type DriveStatus = 'local' | 'pending' | 'uploading' | 'uploaded' | 'error'

export interface MediaItem {
  id: number
  examId: number
  kind: MediaKind
  filePath: string
  fileName: string
  width: number | null
  height: number | null
  durationMs: number | null
  bytes: number | null
  /** Se for uma cópia anotada, aponta para a mídia original. */
  annotatedFrom: number | null
  createdAt: string
  driveFileId: string | null
  driveStatus: DriveStatus
}

/** Situação do envio ao Google Drive, mostrada no canto da tela. */
export interface UploadStatus {
  /** Uma conta Google está conectada. */
  connected: boolean
  /** As credenciais do Google já foram preenchidas no programa. */
  configured: boolean
  email: string
  /** Itens esperando ou em envio. */
  pending: number
  uploading: number
  /** Itens que esgotaram as tentativas e aguardam "reenviar". */
  failed: number
  done: number
  /** A fila está trabalhando neste momento. */
  running: boolean
}

/** Conjunto de ajustes de imagem que pode ser salvo e recarregado. */
export interface CameraPresetData {
  /** Controles do hardware da câmera (brilho, foco, exposição…). */
  camera: Record<string, number | string>
  /** Ajustes feitos por software. */
  software: { brightness: number; contrast: number; saturation: number }
  /** Espelhamento e rotação. */
  transform: { flipHorizontal: boolean; flipVertical: boolean; rotation: 0 | 90 | 180 | 270 }
}

export interface CameraPreset {
  id: number
  /** Vazio identifica o ajuste que o programa guarda sozinho para cada câmera. */
  name: string
  cameraLabel: string
  data: CameraPresetData
  updatedAt: string
}

/** Para onde as capturas estão indo neste momento. */
export interface CaptureContextInfo {
  examId: number
  examTitle: string
  examDate: string
  /** Pasta em disco que está recebendo os arquivos. */
  folder: string
  patientId: number
  patientName: string
  /** true quando nenhum paciente foi escolhido (capturas avulsas do dia). */
  isLoose: boolean
}

/** Resultado de gravar um arquivo em disco. */
export interface SavedFile {
  filePath: string
  fileName: string
  bytes: number
}

/** Espaço livre no disco onde as capturas são gravadas. */
export interface DiskSpace {
  freeBytes: number
  totalBytes: number
}
