import type { MediaItem } from '@shared/types'
import {
  drawTransformed,
  isIdentity,
  isNeutral,
  NEUTRAL_FILTER,
  outputSize,
  type SoftwareFilter,
  type ViewTransform
} from './transform'

/**
 * Foto e vídeo.
 *
 * O que aparece na tela é exatamente o que vai para o arquivo: o mesmo
 * `drawTransformed` desenha os dois. Nada de "a foto saiu diferente da imagem
 * ao vivo", que é o defeito clássico desse tipo de programa.
 */

// --- Foto ---

export interface PhotoResult {
  bytes: Uint8Array
  width: number
  height: number
}

/** Captura o quadro atual na resolução cheia da câmera. */
export async function grabPhoto(
  video: HTMLVideoElement,
  transform: ViewTransform,
  quality: number,
  filter: SoftwareFilter = NEUTRAL_FILTER
): Promise<PhotoResult> {
  const sw = video.videoWidth
  const sh = video.videoHeight
  if (!sw || !sh) throw new Error('A imagem da câmera ainda não chegou.')

  const { width, height } = outputSize(sw, sh, transform)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem para gravação.')

  drawTransformed(ctx, video, sw, sh, width, height, transform, filter)

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
}

/** Converte um canvas já pronto (imagem congelada, imagem anotada) em JPEG. */
export async function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number
): Promise<PhotoResult> {
  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))),
            'image/jpeg',
            quality
          )
        )

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height
  }
}

// --- Vídeo ---

/**
 * Formato de gravação. MP4/H.264 é o que abre em qualquer computador
 * (Windows Media Player, PowerPoint, celular); WebM seria um problema para o
 * usuário final. O Chromium moderno grava MP4 direto — só caímos para WebM se
 * algum dia isso deixar de valer.
 */
export function pickVideoFormat(): { mimeType: string; extension: string } {
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' }
  ]
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate
  }
  throw new Error('Este computador não consegue gravar vídeo.')
}

/** Taxa de bits proporcional à resolução, para não estourar o tamanho do arquivo. */
function bitrateFor(width: number, height: number, fps: number): number {
  const estimate = Math.round(width * height * Math.max(fps, 15) * 0.12)
  return Math.min(Math.max(estimate, 2_000_000), 40_000_000)
}

export interface RecordingOptions {
  stream: MediaStream
  video: HTMLVideoElement
  transform: ViewTransform
  filter?: SoftwareFilter
  /** Chamada a cada pedaço gravado, para atualizar o tamanho na tela. */
  onProgress?: (bytesWritten: number) => void
  onError?: (message: string) => void
}

/**
 * Uma gravação em andamento. Os pedaços vão para o disco conforme chegam; nada
 * fica acumulado na memória.
 */
export class Recording {
  private recorder: MediaRecorder
  private sessionId: string
  private queue: Promise<void> = Promise.resolve()
  private canvasStream: MediaStream | null
  private stopFrameLoop: (() => void) | null
  private finished = false

  readonly startedAt = performance.now()
  readonly filePath: string
  readonly extension: string

  private constructor(init: {
    recorder: MediaRecorder
    sessionId: string
    filePath: string
    extension: string
    canvasStream: MediaStream | null
    stopFrameLoop: (() => void) | null
  }) {
    this.recorder = init.recorder
    this.sessionId = init.sessionId
    this.filePath = init.filePath
    this.extension = init.extension
    this.canvasStream = init.canvasStream
    this.stopFrameLoop = init.stopFrameLoop
  }

  static async start(options: RecordingOptions): Promise<Recording> {
    const { stream, video, transform } = options
    const filter = options.filter ?? NEUTRAL_FILTER
    const track = stream.getVideoTracks()[0]
    if (!track) throw new Error('A câmera não está enviando imagem.')

    const settings = track.getSettings()
    const sourceWidth = settings.width ?? video.videoWidth
    const sourceHeight = settings.height ?? video.videoHeight
    const fps = Math.round(settings.frameRate ?? 30)
    const { width, height } = outputSize(sourceWidth, sourceHeight, transform)

    // Sem espelhamento, rotação ou ajuste por software, gravamos o sinal
    // original da câmera — caminho mais rápido e de melhor qualidade. Havendo
    // qualquer ajuste, passamos por um canvas para que ele fique gravado no
    // arquivo, e não apenas visível na tela.
    let recordStream = stream
    let canvasStream: MediaStream | null = null
    let stopFrameLoop: (() => void) | null = null

    if (!isIdentity(transform) || !isNeutral(filter)) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('Não foi possível preparar a gravação.')

      stopFrameLoop = startFrameLoop(video, () => {
        drawTransformed(ctx, video, sourceWidth, sourceHeight, width, height, transform, filter)
      })

      canvasStream = canvas.captureStream(fps)
      stream.getAudioTracks().forEach((audio) => canvasStream!.addTrack(audio))
      recordStream = canvasStream
    }

    const format = pickVideoFormat()
    const session = await window.microazz.capture.videoStart({
      extension: format.extension,
      width,
      height
    })

    const recorder = new MediaRecorder(recordStream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: bitrateFor(width, height, fps)
    })

    const recording = new Recording({
      recorder,
      sessionId: session.sessionId,
      filePath: session.filePath,
      extension: format.extension,
      canvasStream,
      stopFrameLoop
    })

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return
      recording.enqueue(event.data, options.onProgress, options.onError)
    }
    recorder.onerror = () => {
      options.onError?.('A gravação foi interrompida por um erro do sistema de vídeo.')
    }

    // Um pedaço por segundo: se faltar energia, perde-se no máximo 1 segundo.
    recorder.start(1000)
    return recording
  }

  /** Envia os pedaços em ordem, um de cada vez. */
  private enqueue(
    blob: Blob,
    onProgress?: (bytes: number) => void,
    onError?: (message: string) => void
  ): void {
    this.queue = this.queue
      .then(async () => {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const written = await window.microazz.capture.videoChunk(this.sessionId, bytes)
        onProgress?.(written)
      })
      .catch((err: unknown) => {
        onError?.(`Falha ao gravar no disco: ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  get elapsedMs(): number {
    return performance.now() - this.startedAt
  }

  private async drain(): Promise<void> {
    if (this.finished) return
    this.finished = true

    await new Promise<void>((resolve) => {
      if (this.recorder.state === 'inactive') return resolve()
      this.recorder.onstop = () => resolve()
      this.recorder.stop()
    })

    this.stopFrameLoop?.()
    this.canvasStream?.getVideoTracks().forEach((t) => t.stop())
    // Espera o último pedaço chegar ao disco antes de fechar o arquivo.
    await this.queue
  }

  async stop(): Promise<MediaItem> {
    await this.drain()
    return window.microazz.capture.videoFinish(this.sessionId)
  }

  async cancel(): Promise<void> {
    await this.drain()
    await window.microazz.capture.videoAbort(this.sessionId)
  }
}

/**
 * Executa um desenho a cada quadro novo do vídeo. `requestVideoFrameCallback`
 * dispara exatamente quando a câmera entrega um quadro — não desperdiça CPU
 * redesenhando a mesma imagem.
 */
export function startFrameLoop(video: HTMLVideoElement, draw: () => void): () => void {
  let stopped = false

  if ('requestVideoFrameCallback' in video) {
    let handle = 0
    const tick = (): void => {
      if (stopped) return
      draw()
      handle = video.requestVideoFrameCallback(tick)
    }
    handle = video.requestVideoFrameCallback(tick)
    return () => {
      stopped = true
      video.cancelVideoFrameCallback(handle)
    }
  }

  let raf = 0
  const tick = (): void => {
    if (stopped) return
    draw()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}
