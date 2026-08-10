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

export type CameraStatus = 'starting' | 'live' | 'disconnected' | 'error'

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
 * Cuida das duas coisas que quebram na prática: o cabo USB ser desconectado no
 * meio do exame (a imagem congela e o programa avisa) e o identificador da
 * câmera mudar quando o cabo volta (reconhecemos pelo nome e reabrimos sozinho).
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
        setCameras(available)

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
      setCameras(available)

      const stillThere = available.some(
        (c) => c.deviceId === current?.deviceId || c.label === current?.label
      )

      if (status === 'live' && !stillThere) {
        setStatus('disconnected')
        setError('A câmera foi desconectada. Reconecte o cabo USB — o programa volta sozinho.')
        return
      }

      // A câmera de sempre reapareceu: reabre sem o usuário precisar clicar.
      if (status !== 'live') {
        const back = available.some(
          (c) => c.label === settings.cameraLabel || c.deviceId === settings.cameraDeviceId
        )
        if (back || (available.length > 0 && !settings.cameraLabel)) setAttempt((n) => n + 1)
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [status, current, settings.cameraLabel, settings.cameraDeviceId])

  const selectCamera = useCallback((deviceId: string): void => {
    requestedDeviceId.current = deviceId
    setAttempt((n) => n + 1)
  }, [])

  const retry = useCallback((): void => setAttempt((n) => n + 1), [])

  return { cameras, current, stream, status, error, info, selectCamera, retry }
}
