/**
 * Controles reais da câmera (padrão UVC).
 *
 * Cada modelo expõe um conjunto diferente: uma câmera de microscópio barata
 * pode oferecer só brilho e contraste, outra oferece foco e exposição manuais.
 * Em vez de mostrar sliders que não fazem nada, perguntamos ao dispositivo o
 * que ele aceita e montamos o painel a partir disso.
 *
 * Quando a câmera não oferece brilho/contraste/saturação, o mesmo ajuste é
 * feito por software na hora de desenhar o quadro — o usuário vê um slider só,
 * com uma etiqueta dizendo de onde vem o efeito.
 */

/** O tipo do DOM não descreve os controles UVC; descrevemos aqui. */
interface Range {
  min?: number
  max?: number
  step?: number
}

type RawCapabilities = Record<string, Range | string[] | undefined>
type RawSettings = Record<string, number | string | undefined>

/** Controles contínuos (viram sliders). */
export type RangeControlId =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'sharpness'
  | 'colorTemperature'
  | 'exposureTime'
  | 'exposureCompensation'
  | 'focusDistance'
  | 'zoom'

/** Controles de modo (viram botões automático/manual). */
export type ModeControlId = 'whiteBalanceMode' | 'exposureMode' | 'focusMode'

export interface RangeControl {
  id: RangeControlId
  label: string
  min: number
  max: number
  step: number
  value: number
  /** De onde vem o efeito: o hardware da câmera ou o desenho por software. */
  source: 'camera' | 'software'
  unit?: string
}

export interface ModeControl {
  id: ModeControlId
  label: string
  /** Modos que a câmera aceita, ex.: ['continuous', 'manual']. */
  modes: string[]
  value: string
  /** Slider que fica disponível quando o modo é manual. */
  manualControl?: RangeControlId
}

const RANGE_LABELS: Record<RangeControlId, { label: string; unit?: string }> = {
  brightness: { label: 'Brilho' },
  contrast: { label: 'Contraste' },
  saturation: { label: 'Saturação' },
  sharpness: { label: 'Nitidez' },
  colorTemperature: { label: 'Temperatura de cor', unit: 'K' },
  exposureTime: { label: 'Tempo de exposição' },
  exposureCompensation: { label: 'Compensação de exposição' },
  focusDistance: { label: 'Foco' },
  zoom: { label: 'Zoom óptico' }
}

const MODE_LABELS: Record<ModeControlId, { label: string; manualControl: RangeControlId }> = {
  whiteBalanceMode: { label: 'Balanço de branco', manualControl: 'colorTemperature' },
  exposureMode: { label: 'Exposição', manualControl: 'exposureTime' },
  focusMode: { label: 'Foco', manualControl: 'focusDistance' }
}

/** Ordem em que os controles aparecem no painel. */
const RANGE_ORDER: RangeControlId[] = [
  'brightness',
  'contrast',
  'saturation',
  'sharpness',
  'colorTemperature',
  'exposureTime',
  'exposureCompensation',
  'focusDistance',
  'zoom'
]

function videoTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null
}

/** Sliders que a câmera aceita de verdade. */
export function readCameraControls(stream: MediaStream | null): RangeControl[] {
  const track = videoTrack(stream)
  if (!track) return []

  const capabilities = track.getCapabilities() as RawCapabilities
  const settings = track.getSettings() as RawSettings
  const controls: RangeControl[] = []

  for (const id of RANGE_ORDER) {
    const range = capabilities[id]
    if (!range || Array.isArray(range)) continue
    if (typeof range.min !== 'number' || typeof range.max !== 'number') continue
    if (range.max <= range.min) continue

    const current = settings[id]
    controls.push({
      id,
      label: RANGE_LABELS[id].label,
      unit: RANGE_LABELS[id].unit,
      min: range.min,
      max: range.max,
      step: range.step && range.step > 0 ? range.step : (range.max - range.min) / 100,
      value: typeof current === 'number' ? current : (range.min + range.max) / 2,
      source: 'camera'
    })
  }

  return controls
}

/** Modos automático/manual que a câmera aceita. */
export function readCameraModes(stream: MediaStream | null): ModeControl[] {
  const track = videoTrack(stream)
  if (!track) return []

  const capabilities = track.getCapabilities() as RawCapabilities
  const settings = track.getSettings() as RawSettings
  const modes: ModeControl[] = []

  for (const id of Object.keys(MODE_LABELS) as ModeControlId[]) {
    const available = capabilities[id]
    if (!Array.isArray(available) || available.length < 2) continue

    modes.push({
      id,
      label: MODE_LABELS[id].label,
      modes: available,
      value: String(settings[id] ?? available[0]),
      manualControl: MODE_LABELS[id].manualControl
    })
  }

  return modes
}

/**
 * Aplica um ajuste na câmera. O Chromium exige que os controles UVC passem
 * pela lista `advanced`.
 */
export async function applyCameraControl(
  stream: MediaStream | null,
  id: RangeControlId | ModeControlId,
  value: number | string
): Promise<void> {
  const track = videoTrack(stream)
  if (!track) return
  await track.applyConstraints({
    advanced: [{ [id]: value }]
  } as MediaTrackConstraints)
}

/** Traduz o nome técnico do modo para o que o usuário entende. */
export function describeMode(mode: string): string {
  switch (mode) {
    case 'none':
      return 'Desligado'
    case 'manual':
      return 'Manual'
    case 'single-shot':
      return 'Uma vez'
    case 'continuous':
      return 'Automático'
    default:
      return mode
  }
}
