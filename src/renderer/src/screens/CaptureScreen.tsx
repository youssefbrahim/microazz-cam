import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CircleStop,
  FlipHorizontal,
  FlipVertical,
  Eye,
  EyeOff,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  Timer,
  UserRound,
  Video
} from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { RESOLUTION_CHOICES } from '../lib/camera'
import { useCamera } from '../lib/useCamera'
import { Recording, canvasToJpeg, grabPhoto, startFrameLoop } from '../lib/capture'
import {
  drawTransformed,
  nextRotation,
  outputSize,
  type SoftwareFilter,
  type ViewTransform
} from '../lib/transform'
import { ControlsPanel } from '../components/ControlsPanel'
import { AnnotationEditor } from '../components/AnnotationEditor'
import { PatientPicker } from '../components/PatientPicker'
import { DriveBadge } from '../components/DriveSettings'
import { onAction } from '../lib/actions'
import { describeAccelerator, type ShortcutAction } from '@shared/shortcuts'
import { playRecordingTone, playShutter } from '../lib/feedback'
import { useApp } from '../store'
import './CaptureScreen.css'

export function CaptureScreen(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)
  const context = useApp((s) => s.context)
  const shortcuts = useApp((s) => s.shortcuts)
  /** Modo "só a imagem": some tudo, fica a imagem ao vivo ocupando o monitor. */
  const cinema = useApp((s) => s.fullscreen)

  /** Tecla configurada para uma ação, já formatada para aparecer no botão. */
  const keyFor = useCallback(
    (action: ShortcutAction): string => {
      const binding = shortcuts.find((s) => s.action === action)
      return binding ? describeAccelerator(binding.accelerator) : ''
    },
    [shortcuts]
  )

  const camera = useCamera()

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  /** Quadro congelado, em resolução cheia. Nulo = imagem ao vivo. */
  const frozenRef = useRef<ImageBitmap | null>(null)
  const [frozen, setFrozen] = useState(false)

  /** Redesenho da pré-visualização, para chamar fora do laço de quadros. */
  const renderRef = useRef<(() => void) | null>(null)

  const recordingRef = useRef<Recording | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const timelapseRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [timelapseCount, setTimelapseCount] = useState(0)

  const [flash, setFlash] = useState(0)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [recent, setRecent] = useState<MediaItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  /** Foto aberta no editor de anotações, se houver. */
  const [annotating, setAnnotating] = useState<MediaItem | null>(null)

  const transform: ViewTransform = {
    flipH: settings.flipHorizontal,
    flipV: settings.flipVertical,
    rotation: settings.rotation
  }
  const filter: SoftwareFilter = {
    brightness: settings.swBrightness,
    contrast: settings.swContrast,
    saturation: settings.swSaturation
  }

  // Guardados em refs para o laço de desenho enxergar sempre o valor atual sem
  // precisar ser recriado a cada ajuste de slider.
  const transformRef = useRef(transform)
  transformRef.current = transform
  const filterRef = useRef(filter)
  filterRef.current = filter
  const cinemaRef = useRef(cinema)
  cinemaRef.current = cinema

  // --- Contexto (paciente/exame) e capturas recentes ---

  // A tira mostra só as capturas do exame atual. Ao trocar de paciente, as
  // fotos do anterior somem da tela — questão de privacidade, não de estética.
  useEffect(() => {
    const examId = context?.examId
    if (examId === undefined) return
    void window.microazz.media.forExam(examId).then(setRecent)
  }, [context?.examId])

  // --- Liga o sinal da câmera ao elemento de vídeo escondido ---

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = camera.stream
    if (camera.stream) void video.play().catch(() => undefined)
  }, [camera.stream])

  // --- Desenho da pré-visualização ---
  //
  // A imagem passa por um canvas (e não por um <video> com CSS) para que o
  // espelhamento e a rotação que aparecem na tela sejam exatamente os mesmos
  // que vão para o arquivo. O canvas tem o tamanho da área visível, não os 4K
  // da câmera — desenhar em tamanho reduzido é o que mantém o programa leve.

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!video || !canvas || !stage || !camera.stream) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const render = (): void => {
      const source = frozenRef.current ?? video
      const sw = frozenRef.current?.width ?? video.videoWidth
      const sh = frozenRef.current?.height ?? video.videoHeight
      if (!sw || !sh) return

      // O tamanho da área é lido a cada quadro, e não guardado de um
      // observador: qualquer mudança de layout que o observador não pegasse
      // (entrar em tela cheia, esconder o painel) deixava a imagem presa num
      // tamanho antigo. É uma leitura barata perto de desenhar o quadro.
      const stageWidth = stage.clientWidth
      const stageHeight = stage.clientHeight
      if (!stageWidth || !stageHeight) return

      const out = outputSize(sw, sh, transformRef.current)

      // Cabe na área disponível preservando a proporção. Na janela normal a
      // imagem nunca é ampliada além do tamanho real (ampliar borra); em tela
      // cheia ela é, porque aí o objetivo é justamente encher o monitor.
      const inCinema = cinemaRef.current
      const margin = inCinema ? 0 : 24
      const fit = Math.min(
        (stageWidth - margin) / out.width,
        (stageHeight - margin) / out.height,
        inCinema ? Infinity : 1
      )

      const dpr = window.devicePixelRatio || 1
      const cssWidth = Math.max(1, Math.floor(out.width * fit))
      const cssHeight = Math.max(1, Math.floor(out.height * fit))
      const pixelWidth = Math.floor(cssWidth * dpr)
      const pixelHeight = Math.floor(cssHeight * dpr)

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
      }

      drawTransformed(
        ctx,
        source,
        sw,
        sh,
        pixelWidth,
        pixelHeight,
        transformRef.current,
        filterRef.current
      )
    }

    renderRef.current = render

    // Congelado: não há quadros novos, então redesenhamos quando um ajuste
    // muda ou quando a área muda de tamanho.
    if (frozen) {
      render()
      const observer = new ResizeObserver(render)
      observer.observe(stage)
      return () => {
        renderRef.current = null
        observer.disconnect()
      }
    }

    const stop = startFrameLoop(video, render)
    return () => {
      stop()
      renderRef.current = null
    }
  }, [camera.stream, frozen])

  // Com a imagem congelada não há laço de desenho, então um ajuste de slider
  // precisa pedir o redesenho explicitamente.
  useEffect(() => {
    if (frozen) renderRef.current?.()
  }, [
    frozen,
    cinema,
    settings.flipHorizontal,
    settings.flipVertical,
    settings.rotation,
    settings.swBrightness,
    settings.swContrast,
    settings.swSaturation
  ])

  // --- Cronômetro da gravação ---

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      setElapsed(recordingRef.current?.elapsedMs ?? 0)
    }, 250)
    return () => clearInterval(timer)
  }, [recording])

  // --- Ações ---

  const takePhoto = useCallback(async (): Promise<MediaItem | null> => {
    const video = videoRef.current
    if (!video || camera.status !== 'live') return null

    try {
      const t = transformRef.current
      const f = filterRef.current
      const frame = frozenRef.current

      let photo: Awaited<ReturnType<typeof grabPhoto>>
      if (frame) {
        // Congelada: salva o quadro guardado, na resolução cheia.
        const out = outputSize(frame.width, frame.height, t)
        const canvas = new OffscreenCanvas(out.width, out.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Não foi possível preparar a imagem.')
        drawTransformed(ctx, frame, frame.width, frame.height, out.width, out.height, t, f)
        photo = await canvasToJpeg(canvas, settings.photoQuality)
      } else {
        photo = await grabPhoto(video, t, settings.photoQuality, f)
      }

      const media = await window.microazz.capture.photo({
        bytes: photo.bytes,
        width: photo.width,
        height: photo.height
      })

      setFlash((n) => n + 1)
      if (settings.shutterSound) playShutter()
      setRecent((items) => [media, ...items].slice(0, 24))
      return media
    } catch (err) {
      notify(`Não foi possível salvar a foto. ${errorText(err)}`, 'error')
      return null
    }
  }, [camera.status, notify, settings.photoQuality, settings.shutterSound])

  const handlePhoto = useCallback(async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const media = await takePhoto()
    setBusy(false)
    if (media) notify(`Foto salva: ${media.fileName}`)
  }, [busy, notify, takePhoto])

  const toggleFreeze = useCallback(async (): Promise<void> => {
    const video = videoRef.current
    if (!video || camera.status !== 'live') return

    if (frozen) {
      frozenRef.current?.close()
      frozenRef.current = null
      setFrozen(false)
      return
    }

    try {
      // Guarda o quadro na resolução cheia: o que for salvo depois sai com a
      // mesma qualidade de uma foto normal.
      frozenRef.current = await createImageBitmap(video)
      setFrozen(true)
    } catch (err) {
      notify(`Não foi possível congelar a imagem. ${errorText(err)}`, 'error')
    }
  }, [camera.status, frozen, notify])

  const startRecording = useCallback(async (): Promise<void> => {
    const video = videoRef.current
    if (!video || !camera.stream || camera.status !== 'live' || recordingRef.current) return

    try {
      const rec = await Recording.start({
        stream: camera.stream,
        video,
        transform: transformRef.current,
        filter: filterRef.current,
        onError: (message) => notify(message, 'error')
      })
      recordingRef.current = rec
      setRecording(true)
      setElapsed(0)
      playRecordingTone(true)
    } catch (err) {
      notify(`Não foi possível iniciar a gravação. ${errorText(err)}`, 'error')
    }
  }, [camera.status, camera.stream, notify])

  const stopRecording = useCallback(async (): Promise<void> => {
    const rec = recordingRef.current
    if (!rec) return
    recordingRef.current = null
    setRecording(false)

    try {
      const media = await rec.stop()
      playRecordingTone(false)
      setRecent((items) => [media, ...items].slice(0, 24))
      notify(`Vídeo salvo: ${media.fileName}`)
    } catch (err) {
      notify(`Falha ao encerrar a gravação. ${errorText(err)}`, 'error')
    }
  }, [notify])

  const toggleRecording = useCallback((): void => {
    void (recordingRef.current ? stopRecording() : startRecording())
  }, [startRecording, stopRecording])

  const stopTimelapse = useCallback((): void => {
    if (timelapseRef.current) clearInterval(timelapseRef.current)
    timelapseRef.current = null
    setTimelapseCount(0)
  }, [])

  const toggleTimelapse = useCallback((): void => {
    if (timelapseRef.current) {
      stopTimelapse()
      notify('Captura em intervalos encerrada.')
      return
    }

    const intervalMs = Math.max(2, settings.timelapseInterval) * 1000
    const limit = settings.timelapseLimit

    void takePhoto().then(() => setTimelapseCount(1))
    timelapseRef.current = setInterval(() => {
      void takePhoto().then((media) => {
        if (!media) return
        setTimelapseCount((count) => {
          const next = count + 1
          if (limit > 0 && next >= limit) {
            stopTimelapse()
            notify(`Captura em intervalos concluída: ${next} fotos.`)
          }
          return next
        })
      })
    }, intervalMs)

    notify(
      `Capturando 1 foto a cada ${settings.timelapseInterval}s` +
        (limit > 0 ? `, até ${limit} fotos.` : '.')
    )
  }, [notify, settings.timelapseInterval, settings.timelapseLimit, stopTimelapse, takePhoto])

  // Ações da tela de captura. Chegam do botão, do teclado ou do pedal — todas
  // pelo mesmo canal, então o comportamento é idêntico nos três casos.
  useEffect(
    () =>
      onAction((action) => {
        switch (action) {
          case 'photo':
            void handlePhoto()
            break
          case 'video':
            toggleRecording()
            break
          case 'freeze':
            void toggleFreeze()
            break
          case 'patient':
            setPickerOpen(true)
            break
          default:
            break
        }
      }),
    [handlePhoto, toggleFreeze, toggleRecording]
  )

  // --- Controles flutuantes da tela cheia ---
  //
  // Aparecem ao mexer o mouse e somem sozinhos, junto com o cursor, depois de
  // três segundos parados — nada deve competir com a imagem do microscópio.

  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wakeOverlay = useCallback((): void => {
    setOverlayVisible(true)
    if (overlayTimer.current) clearTimeout(overlayTimer.current)
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 3000)
  }, [])

  useEffect(() => {
    if (!cinema) {
      if (overlayTimer.current) clearTimeout(overlayTimer.current)
      setOverlayVisible(true)
      return
    }
    wakeOverlay()
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current)
    }
  }, [cinema, wakeOverlay])

  // Encerra gravação e intervalos ao sair da tela.
  useEffect(() => {
    return () => {
      if (timelapseRef.current) clearInterval(timelapseRef.current)
      const rec = recordingRef.current
      recordingRef.current = null
      if (rec) void rec.stop().catch(() => undefined)
      frozenRef.current?.close()
      frozenRef.current = null
    }
  }, [])

  const live = camera.status === 'live'
  const resolutionValue = `${settings.cameraWidth}x${settings.cameraHeight}`

  return (
    <div
      className={`capture ${cinema ? 'capture--cinema' : ''} ${
        cinema && !overlayVisible ? 'capture--quiet' : ''
      }`}
      onPointerMove={cinema ? wakeOverlay : undefined}
    >
      <div className="capture__main">
      {!cinema && (
      <div className="capture__top">
        <div className="field">
          <span
            className={`dot ${
              live ? 'dot--live' : camera.status === 'error' ? 'dot--err' : 'dot--off'
            }`}
          />
          <select
            className="select"
            value={camera.current?.deviceId ?? ''}
            onChange={(e) => camera.selectCamera(e.target.value)}
            disabled={camera.cameras.length === 0}
            title="Câmera"
          >
            {camera.cameras.length === 0 && <option value="">Nenhuma câmera encontrada</option>}
            {camera.cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <select
            className="select"
            value={resolutionValue}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number)
              void updateSettings({ cameraWidth: w, cameraHeight: h })
            }}
            title="Resolução"
          >
            {RESOLUTION_CHOICES.map((r) => (
              <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <DriveBadge />

        {live && camera.info.width > 0 && (
          <span style={{ color: 'var(--shell-text-muted)', fontSize: 12 }}>
            {camera.info.width} × {camera.info.height}
            {camera.info.frameRate > 0 && ` · ${camera.info.frameRate} fps`}
          </span>
        )}

        <button
          type="button"
          className={`capture__context ${context?.isLoose ? 'capture__context--loose' : ''}`}
          onClick={() => setPickerOpen(true)}
          title="Trocar paciente ou exame (F4)"
        >
          <UserRound size={14} />
          {!context || context.isLoose ? (
            <>Sem paciente · capturas avulsas</>
          ) : (
            <>
              <strong>{settings.privacyMode ? '•••••' : context.patientName}</strong>
              <span style={{ opacity: 0.6 }}>·</span>
              {context.examTitle}
            </>
          )}
          <span className="ctl__key">{keyFor('patient')}</span>
        </button>

        <button
          type="button"
          className={`ctl ctl--icon ${settings.privacyMode ? 'ctl--on' : ''}`}
          onClick={() => void updateSettings({ privacyMode: !settings.privacyMode })}
          title={
            settings.privacyMode
              ? 'Modo privacidade ligado: o nome do paciente fica oculto'
              : 'Ocultar o nome do paciente na tela'
          }
        >
          {settings.privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      )}

      <div className="stage" ref={stageRef}>
        <video ref={videoRef} className="stage__hidden-video" muted playsInline />

        {live ? (
          <canvas ref={canvasRef} className="stage__canvas" />
        ) : (
          <div className="stage__message">
            <h2>
              {camera.status === 'starting'
                ? 'Procurando a câmera…'
                : camera.status === 'disconnected'
                  ? 'Câmera desconectada'
                  : 'Não foi possível abrir a câmera'}
            </h2>
            <p>{camera.error || 'Aguarde um instante.'}</p>
            {camera.status !== 'starting' && (
              <button type="button" className="ctl ctl--primary" onClick={camera.retry}>
                <RefreshCw size={16} /> Tentar de novo
              </button>
            )}
          </div>
        )}

        {recording && (
          <div className="stage__rec">
            <span className="stage__rec-dot" />
            REC {formatElapsed(elapsed)}
          </div>
        )}
        {frozen && !recording && <div className="stage__frozen">IMAGEM CONGELADA</div>}
        {timelapseCount > 0 && (
          <div className="stage__timelapse">
            <Timer size={13} style={{ verticalAlign: -2 }} /> {timelapseCount} foto
            {timelapseCount === 1 ? '' : 's'}
          </div>
        )}
        {flash > 0 && <div className="stage__flash" key={flash} />}

        {/*
          Em tela cheia os controles flutuam sobre a imagem e somem sozinhos
          depois de alguns segundos parados — junto com o cursor. O que fica na
          tela é só a imagem do microscópio.
        */}
        {cinema && (
          <div className="cine">
            {context && !context.isLoose && (
              <span className="cine__patient">
                {settings.privacyMode ? '•••••' : context.patientName} · {context.examTitle}
              </span>
            )}

            <div className="cine__bar">
              <button
                type="button"
                className="ctl ctl--primary"
                onClick={() => void handlePhoto()}
                disabled={!live || busy}
              >
                <Camera size={17} /> Foto <span className="ctl__key">{keyFor('photo')}</span>
              </button>
              <button
                type="button"
                className={`ctl ${recording ? 'ctl--danger' : ''}`}
                onClick={toggleRecording}
                disabled={!live || frozen}
              >
                {recording ? <CircleStop size={17} /> : <Video size={17} />}
                {recording ? 'Parar' : 'Gravar'}
                <span className="ctl__key">{keyFor('video')}</span>
              </button>
              <button
                type="button"
                className={`ctl ${frozen ? 'ctl--active' : ''}`}
                onClick={() => void toggleFreeze()}
                disabled={!live || recording}
              >
                {frozen ? <Play size={17} /> : <Pause size={17} />}
                {frozen ? 'Voltar ao vivo' : 'Congelar'}
                <span className="ctl__key">{keyFor('freeze')}</span>
              </button>
              <button
                type="button"
                className="ctl"
                onClick={() => void window.microazz.app.toggleFullscreen()}
                title="Voltar à janela normal"
              >
                <Minimize2 size={17} /> Sair
                <span className="ctl__key">{keyFor('fullscreen')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {!cinema && (
      <div className="controls">
        <button
          type="button"
          className="ctl ctl--primary"
          onClick={() => void handlePhoto()}
          disabled={!live || busy}
        >
          <Camera size={17} /> Foto <span className="ctl__key">{keyFor('photo')}</span>
        </button>

        <button
          type="button"
          className={`ctl ${recording ? 'ctl--danger' : ''}`}
          onClick={toggleRecording}
          disabled={!live || frozen}
          title={frozen ? 'Descongele a imagem para gravar' : undefined}
        >
          {recording ? <CircleStop size={17} /> : <Video size={17} />}
          {recording ? 'Parar' : 'Gravar'} <span className="ctl__key">{keyFor('video')}</span>
        </button>

        <button
          type="button"
          className={`ctl ${frozen ? 'ctl--active' : ''}`}
          onClick={() => void toggleFreeze()}
          disabled={!live || recording}
        >
          {frozen ? <Play size={17} /> : <Pause size={17} />}
          {frozen ? 'Voltar ao vivo' : 'Congelar'} <span className="ctl__key">{keyFor('freeze')}</span>
        </button>

        <button
          type="button"
          className={`ctl ${timelapseCount > 0 ? 'ctl--active' : ''}`}
          onClick={toggleTimelapse}
          disabled={!live}
          title={`Uma foto a cada ${settings.timelapseInterval} segundos`}
        >
          <Timer size={17} /> {timelapseCount > 0 ? 'Parar intervalos' : 'Intervalos'}
        </button>

        <div className="controls__spacer" />

        <button
          type="button"
          className={`ctl ctl--icon ${settings.flipHorizontal ? 'ctl--active' : ''}`}
          onClick={() => void updateSettings({ flipHorizontal: !settings.flipHorizontal })}
          title="Espelhar na horizontal"
        >
          <FlipHorizontal size={17} />
        </button>
        <button
          type="button"
          className={`ctl ctl--icon ${settings.flipVertical ? 'ctl--active' : ''}`}
          onClick={() => void updateSettings({ flipVertical: !settings.flipVertical })}
          title="Espelhar na vertical"
        >
          <FlipVertical size={17} />
        </button>
        <button
          type="button"
          className={`ctl ctl--icon ${settings.rotation !== 0 ? 'ctl--active' : ''}`}
          onClick={() => void updateSettings({ rotation: nextRotation(settings.rotation) })}
          title={`Girar (agora: ${settings.rotation}°)`}
        >
          <RotateCw size={17} />
        </button>
        <button
          type="button"
          className={`ctl ctl--icon ${panelOpen ? 'ctl--on' : ''}`}
          onClick={() => setPanelOpen((open) => !open)}
          title="Mostrar ou esconder os ajustes da imagem"
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
      )}

      {!cinema && (
      <div className="strip">
        {recent.length === 0 ? (
          <span className="strip__empty">
            As capturas deste exame aparecem aqui assim que você fotografar.
          </span>
        ) : (
          recent.map((item) => (
            <button
              key={item.id}
              type="button"
              className="thumb"
              title={
                item.kind === 'video'
                  ? `${item.fileName} — clique para assistir`
                  : `${item.fileName} — clique para anotar`
              }
              onClick={() => {
                // Vídeo abre no player do Windows; foto abre o editor de anotações.
                if (item.kind === 'video') void window.microazz.app.openPath(item.filePath)
                else setAnnotating(item)
              }}
            >
              {item.kind === 'video' ? (
                <span className="thumb__video">
                  <Video size={20} />
                </span>
              ) : (
                <img src={window.microazz.media.url(item.filePath)} alt={item.fileName} />
              )}
              {item.kind === 'video' && item.durationMs && (
                <span className="thumb__tag">{formatElapsed(item.durationMs)}</span>
              )}
            </button>
          ))
        )}
      </div>
      )}
      </div>

      {!cinema && panelOpen && (
        <ControlsPanel stream={camera.stream} cameraLabel={camera.current?.label ?? ''} />
      )}

      {pickerOpen && <PatientPicker onClose={() => setPickerOpen(false)} />}

      {annotating && (
        <AnnotationEditor
          media={annotating}
          onClose={() => setAnnotating(null)}
          onSaved={(created) => setRecent((items) => [created, ...items].slice(0, 24))}
        />
      )}
    </div>
  )
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
