import { useCallback, useEffect, useRef, useState } from 'react'
import {
  describeCameraError,
  describeStream,
  listCameras,
  openCamera,
  resolveCamera,
  stopStream,
  type CameraDevice
} from './camera'
import { useApp } from '../store'
import { decideCameraChange, type CameraStatus } from '@shared/cameraChange'

export type { CameraStatus }

export interface CameraState {
  cameras: CameraDevice[]
  current: CameraDevice | null
  stream: MediaStream | null
  status: CameraStatus
  error: string
  info: { width: number; height: number; frameRate: number }
  selectCamera: (deviceId: string) => void
  retry: () => void
}

/**
 * Mantém a câmera aberta.
 *
 * Cuida das três coisas que quebram na prática: o cabo USB ser desconectado no
 * meio do exame (a imagem congela e o programa avisa), o identificador da
 * câmera mudar quando o cabo volta (reconhecemos pelo nome e reabrimos sozinho)
 * e o usuário trocar de microscópio (uma câmera que nunca vimos antes é aberta
 * sozinha, em vez de exigir que o nome bata com o da câmera anterior).
 */
export function useCamera(): CameraState {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)

  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [current, setCurrent] = useState<CameraDevice | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [error, setError] = useState('')
  const [info, setInfo] = useState({ width: 0, height: 0, frameRate: 0 })

  /** Cresce a cada tentativa de abrir; descarta resultados de tentativas antigas. */
  const generation = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const [attempt, setAttempt] = useState(0)

  /** Escolha manual do usuário; vence a câmera salva nas configurações. */
  const requestedDeviceId = useRef<string | null>(null)

  /**
   * Identificadores já vistos. Serve para separar uma câmera que acabou de ser
   * conectada de outra que sempre esteve aí — a webcam embutida, tipicamente.
   */
  const knownIds = useRef<Set<string> | null>(null)

  /** Guarda a lista e devolve quem apareceu desde a última leitura. */
  const trackCameras = useCallback((available: CameraDevice[]): CameraDevice[] => {
    const previous = knownIds.current
    knownIds.current = new Set(available.map((c) => c.deviceId))
    setCameras(available)
    // Na primeira leitura ninguém é novidade: tudo já estava conectado.
    if (previous === null) return []
    return available.filter((c) => !previous.has(c.deviceId))
  }, [])

  const wanted = {
    deviceId: settings.cameraDeviceId,
    label: settings.cameraLabel,
    width: settings.cameraWidth,
    height: settings.cameraHeight,
    audioDeviceId: settings.recordAudio ? settings.audioDeviceId : ''
  }

  useEffect(() => {
    const myGeneration = ++generation.current
    let cancelled = false

    const cleanup = (): void => {
      stopStream(streamRef.current)
      streamRef.current = null
    }

    const start = async (): Promise<void> => {
      setStatus('starting')
      setError('')

      try {
        const available = await listCameras()
        if (cancelled || myGeneration !== generation.current) return
        trackCameras(available)

        if (available.length === 0) {
          setStatus('disconnected')
          setError(
            'Nenhuma câmera encontrada. Conecte o cabo USB do microscópio — o programa reconhece sozinho assim que ela aparecer.'
          )
          return
        }

        const chosen = resolveCamera(
          available,
          requestedDeviceId.current ?? wanted.deviceId,
          requestedDeviceId.current ? '' : wanted.label
        )
        if (!chosen) return

        cleanup()
        const opened = await openCamera({
          deviceId: chosen.deviceId,
          width: wanted.width,
          height: wanted.height,
          audioDeviceId: wanted.audioDeviceId || undefined
        })

        if (cancelled || myGeneration !== generation.current) {
          stopStream(opened)
          return
        }

        streamRef.current = opened
        setStream(opened)
        setCurrent(chosen)
        setInfo(describeStream(opened))
        setStatus('live')
        requestedDeviceId.current = null

        // O identificador muda quando o cabo é reconectado; guardamos os dois
        // para reencontrar a mesma câmera na próxima vez.
        if (chosen.deviceId !== wanted.deviceId || chosen.label !== wanted.label) {
          void updateSettings({ cameraDeviceId: chosen.deviceId, cameraLabel: chosen.label })
        }

        // O cabo foi arrancado: o Chromium encerra a trilha de vídeo.
        opened.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (myGeneration !== generation.current) return
          setStatus('disconnected')
          setError('A câmera foi desconectada. Reconecte o cabo USB — o programa volta sozinho.')
        })
      } catch (err) {
        if (cancelled || myGeneration !== generation.current) return
        // A tentativa mirada falhou; não deixamos o identificador preso, senão a
        // próxima tentativa persegue uma câmera que talvez nem esteja mais lá.
        requestedDeviceId.current = null
        setStatus('error')
        setError(describeCameraError(err))
      }
    }

    void start()
    return () => {
      cancelled = true
      cleanup()
    }
    // `attempt` força uma nova tentativa; o resto são as preferências que exigem
    // reabrir a câmera com outros parâmetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, wanted.deviceId, wanted.width, wanted.height, wanted.audioDeviceId])

  // Um dispositivo entrou ou saiu do computador.
  useEffect(() => {
    const onDeviceChange = async (): Promise<void> => {
      const available = await listCameras()
      const arrived = trackCameras(available)

      const action = decideCameraChange({
        status,
        available,
        arrived,
        current,
        savedDeviceId: settings.cameraDeviceId,
        savedLabel: settings.cameraLabel
      })

      switch (action.kind) {
        case 'lost':
          setStatus('disconnected')
          setError('A câmera foi desconectada. Reconecte o cabo USB — o programa volta sozinho.')
          break
        case 'open':
          requestedDeviceId.current = action.deviceId
          setAttempt((n) => n + 1)
          break
        case 'reopen':
          setAttempt((n) => n + 1)
          break
        case 'ignore':
          break
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [status, current, settings.cameraLabel, settings.cameraDeviceId, trackCameras])

  const selectCamera = useCallback((deviceId: string): void => {
    requestedDeviceId.current = deviceId
    setAttempt((n) => n + 1)
  }, [])

  const retry = useCallback((): void => setAttempt((n) => n + 1), [])

  return { cameras, current, stream, status, error, info, selectCamera, retry }
}
