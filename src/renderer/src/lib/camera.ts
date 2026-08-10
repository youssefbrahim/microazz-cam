/**
 * Descoberta e abertura das câmeras USB.
 *
 * Câmeras de microscópio são dispositivos UVC comuns: o Chromium enxerga todas
 * sem driver extra. As duas armadilhas práticas são (1) o Windows esconde os
 * nomes até a primeira permissão e (2) o identificador do dispositivo muda
 * quando o cabo é reconectado — por isso guardamos também o nome.
 */

export interface CameraDevice {
  deviceId: string
  label: string
  groupId: string
}

export interface AudioDevice {
  deviceId: string
  label: string
}

/** Resoluções oferecidas na interface. `0` significa "a maior que a câmera der". */
export const RESOLUTION_CHOICES: Array<{ width: number; height: number; label: string }> = [
  { width: 0, height: 0, label: 'Máxima disponível' },
  { width: 640, height: 480, label: '640 × 480' },
  { width: 1280, height: 720, label: '1280 × 720 (HD)' },
  { width: 1920, height: 1080, label: '1920 × 1080 (Full HD)' },
  { width: 2560, height: 1440, label: '2560 × 1440 (2K)' },
  { width: 3840, height: 2160, label: '3840 × 2160 (4K)' }
]

/**
 * Pede acesso uma vez só para o Windows liberar os nomes dos dispositivos.
 * Sem isso, `enumerateDevices` devolve uma lista de câmeras sem rótulo.
 */
async function unlockDeviceLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })
  stream.getTracks().forEach((track) => track.stop())
}

export async function listCameras(): Promise<CameraDevice[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  let cameras = devices.filter((d) => d.kind === 'videoinput')

  if (cameras.length > 0 && cameras.every((c) => !c.label)) {
    await unlockDeviceLabels()
    devices = await navigator.mediaDevices.enumerateDevices()
    cameras = devices.filter((d) => d.kind === 'videoinput')
  }

  return cameras.map((c, index) => ({
    deviceId: c.deviceId,
    label: c.label || `Câmera ${index + 1}`,
    groupId: c.groupId
  }))
}

export async function listMicrophones(): Promise<AudioDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, index) => ({ deviceId: d.deviceId, label: d.label || `Microfone ${index + 1}` }))
}

/**
 * Escolhe qual câmera abrir. Prioriza o identificador salvo; se o cabo foi
 * reconectado (identificador novo), reconhece pelo nome; em último caso, a
 * primeira da lista.
 */
export function resolveCamera(
  cameras: CameraDevice[],
  savedDeviceId: string,
  savedLabel: string
): CameraDevice | null {
  if (cameras.length === 0) return null
  return (
    cameras.find((c) => c.deviceId === savedDeviceId) ??
    (savedLabel ? cameras.find((c) => c.label === savedLabel) : undefined) ??
    cameras[0]
  )
}

export interface OpenCameraOptions {
  deviceId: string
  /** 0 = pedir o máximo que o dispositivo oferecer. */
  width: number
  height: number
  audioDeviceId?: string
}

export async function openCamera(options: OpenCameraOptions): Promise<MediaStream> {
  // Pedir uma resolução absurda faz o Chromium entregar o maior modo real da
  // câmera, em vez de cair nos 640×480 padrão.
  const wantsMax = options.width === 0 || options.height === 0
  const width = wantsMax ? 4096 : options.width
  const height = wantsMax ? 4096 : options.height

  const video: MediaTrackConstraints = {
    deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
    width: { ideal: width },
    height: { ideal: height }
  }

  const audio: boolean | MediaTrackConstraints = options.audioDeviceId
    ? { deviceId: { exact: options.audioDeviceId } }
    : false

  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio })
  } catch (err) {
    // Se a câmera exata sumiu entre listar e abrir (cabo removido), tentamos
    // qualquer câmera antes de desistir.
    if (err instanceof DOMException && err.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height } },
        audio
      })
    }
    throw err
  }
}

/** Resolução e taxa de quadros que a câmera realmente entregou. */
export function describeStream(stream: MediaStream): {
  width: number
  height: number
  frameRate: number
} {
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
  return {
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    frameRate: Math.round(settings.frameRate ?? 0)
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Traduz o erro técnico do navegador para algo que o usuário do consultório
 * consiga resolver sozinho.
 */
export function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return (
        'O Windows está bloqueando o acesso à câmera. Abra Iniciar → Configurações → ' +
        'Privacidade e segurança → Câmera e ligue "Permitir que aplicativos da área de ' +
        'trabalho acessem sua câmera". Depois feche e abra o Microazz Cam.'
      )
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhuma câmera foi encontrada. Verifique se o cabo USB do microscópio está conectado.'
    case 'NotReadableError':
    case 'TrackStartError':
      return (
        'A câmera está sendo usada por outro programa. Feche o software do microscópio, ' +
        'o Teams, o Zoom ou o aplicativo Câmera do Windows e tente de novo.'
      )
    case 'OverconstrainedError':
      return 'Esta câmera não aceita a resolução escolhida. Selecione outra em Configurações.'
    case 'AbortError':
      return 'A câmera parou de responder. Desconecte e reconecte o cabo USB.'
    default:
      return `Não foi possível abrir a câmera. ${err instanceof Error ? err.message : String(err)}`
  }
}
