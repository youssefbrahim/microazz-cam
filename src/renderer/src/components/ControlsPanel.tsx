import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save, Trash2 } from 'lucide-react'
import type { CameraPreset, CameraPresetData } from '@shared/types'
import {
  applyCameraControl,
  describeMode,
  readCameraControls,
  readCameraModes,
  type ModeControl,
  type RangeControl,
  type RangeControlId
} from '../lib/capabilities'
import { useApp } from '../store'
import './ControlsPanel.css'

/**
 * Painel lateral de ajuste da imagem.
 *
 * Os sliders são montados a partir do que a câmera diz aceitar — nada de
 * mostrar controle que não faz efeito. Brilho, contraste e saturação, quando a
 * câmera não oferece, são feitos por software e ganham a etiqueta "software"
 * para o usuário saber a diferença.
 */

/** Ajustes por software, sempre disponíveis, usados como reserva. */
const SOFTWARE_FALLBACK: Array<{ id: RangeControlId; label: string; setting: SoftwareKey }> = [
  { id: 'brightness', label: 'Brilho', setting: 'swBrightness' },
  { id: 'contrast', label: 'Contraste', setting: 'swContrast' },
  { id: 'saturation', label: 'Saturação', setting: 'swSaturation' }
]

type SoftwareKey = 'swBrightness' | 'swContrast' | 'swSaturation'

export function ControlsPanel({
  stream,
  cameraLabel
}: {
  stream: MediaStream | null
  cameraLabel: string
}): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)

  const [controls, setControls] = useState<RangeControl[]>([])
  const [modes, setModes] = useState<ModeControl[]>([])
  const [presets, setPresets] = useState<CameraPreset[]>([])
  const [presetName, setPresetName] = useState('')

  // A câmera mudou: relê o que ela aceita e restaura o último ajuste usado.
  useEffect(() => {
    if (!stream) {
      setControls([])
      setModes([])
      return
    }

    const available = readCameraControls(stream)
    setControls(available)
    setModes(readCameraModes(stream))

    let cancelled = false
    void (async () => {
      const [saved, named] = await Promise.all([
        window.microazz.presets.readAuto(cameraLabel),
        window.microazz.presets.list(cameraLabel)
      ])
      if (cancelled) return
      setPresets(named)
      if (saved) await applyPreset(saved.data, available, { silent: true })
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, cameraLabel])

  /** Junta tudo o que está na tela num pacote salvável. */
  const currentData = useCallback((): CameraPresetData => {
    const camera: Record<string, number | string> = {}
    for (const control of controls) camera[control.id] = control.value
    for (const mode of modes) camera[mode.id] = mode.value

    return {
      camera,
      software: {
        brightness: settings.swBrightness,
        contrast: settings.swContrast,
        saturation: settings.swSaturation
      },
      transform: {
        flipHorizontal: settings.flipHorizontal,
        flipVertical: settings.flipVertical,
        rotation: settings.rotation
      }
    }
  }, [controls, modes, settings])

  /** Guarda o estado atual como "último ajuste desta câmera". */
  const rememberCurrent = useCallback((): void => {
    if (!cameraLabel) return
    void window.microazz.presets.save(cameraLabel, '', currentData())
  }, [cameraLabel, currentData])

  const applyPreset = useCallback(
    async (
      data: CameraPresetData,
      available: RangeControl[],
      options: { silent?: boolean } = {}
    ): Promise<void> => {
      // Os modos vêm antes dos valores: pôr o foco em manual só faz sentido
      // antes de mandar a distância de foco.
      for (const [id, value] of Object.entries(data.camera)) {
        if (!id.endsWith('Mode')) continue
        await applyCameraControl(stream, id as never, value).catch(() => undefined)
      }
      for (const [id, value] of Object.entries(data.camera)) {
        if (id.endsWith('Mode')) continue
        if (!available.some((c) => c.id === id)) continue
        await applyCameraControl(stream, id as never, value).catch(() => undefined)
      }

      await updateSettings({
        swBrightness: data.software.brightness,
        swContrast: data.software.contrast,
        swSaturation: data.software.saturation,
        flipHorizontal: data.transform.flipHorizontal,
        flipVertical: data.transform.flipVertical,
        rotation: data.transform.rotation
      })

      setControls(readCameraControls(stream))
      setModes(readCameraModes(stream))
      if (!options.silent) notify('Ajustes aplicados.')
    },
    [notify, stream, updateSettings]
  )

  const changeControl = useCallback(
    (id: RangeControlId, value: number): void => {
      setControls((list) => list.map((c) => (c.id === id ? { ...c, value } : c)))
      void applyCameraControl(stream, id, value).catch(() => {
        notify('A câmera recusou este ajuste.', 'error')
      })
    },
    [notify, stream]
  )

  const changeMode = useCallback(
    (id: ModeControl['id'], value: string): void => {
      setModes((list) => list.map((m) => (m.id === id ? { ...m, value } : m)))
      void applyCameraControl(stream, id, value)
        .then(() => {
          // Sair do automático costuma liberar o slider manual correspondente.
          setControls(readCameraControls(stream))
        })
        .catch(() => notify('A câmera recusou este ajuste.', 'error'))
    },
    [notify, stream]
  )

  const changeSoftware = useCallback(
    (key: SoftwareKey, value: number): void => {
      void updateSettings({ [key]: value })
    },
    [updateSettings]
  )

  const resetAll = useCallback((): void => {
    void updateSettings({
      swBrightness: 1,
      swContrast: 1,
      swSaturation: 1,
      flipHorizontal: false,
      flipVertical: false,
      rotation: 0
    })
    // Cada controle volta ao meio da faixa que a própria câmera declarou.
    for (const control of controls) {
      const middle = (control.min + control.max) / 2
      changeControl(control.id, middle)
    }
    notify('Ajustes voltaram ao padrão.')
  }, [changeControl, controls, notify, updateSettings])

  const saveNamed = useCallback((): void => {
    const name = presetName.trim()
    if (!name) {
      notify('Dê um nome à predefinição, por exemplo "Objetiva 40x".', 'error')
      return
    }
    void window.microazz.presets.save(cameraLabel, name, currentData()).then(() => {
      setPresetName('')
      void window.microazz.presets.list(cameraLabel).then(setPresets)
      notify(`Predefinição "${name}" salva.`)
    })
  }, [cameraLabel, currentData, notify, presetName])

  // Guarda o ajuste atual sempre que algo muda, com uma folga para não gravar
  // no banco a cada pixel arrastado no slider.
  useEffect(() => {
    if (!stream || !cameraLabel) return
    const timer = setTimeout(rememberCurrent, 800)
    return () => clearTimeout(timer)
  }, [cameraLabel, rememberCurrent, stream])

  // Controles que a câmera não oferece caem para o ajuste por software.
  const softwareControls = SOFTWARE_FALLBACK.filter(
    (fallback) => !controls.some((c) => c.id === fallback.id)
  )

  const hasAnything = controls.length > 0 || modes.length > 0 || softwareControls.length > 0

  return (
    <aside className="panel">
      <div className="panel__head">
        <span>Ajustes da imagem</span>
        <button type="button" className="panel__reset" onClick={resetAll} title="Voltar ao padrão">
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="panel__body">
        {!hasAnything && <p className="panel__empty">Conecte uma câmera para ver os ajustes.</p>}

        {modes.map((mode) => (
          <div className="panel__group" key={mode.id}>
            <div className="panel__label">{mode.label}</div>
            <div className="panel__modes">
              {mode.modes.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip ${mode.value === option ? 'chip--on' : ''}`}
                  onClick={() => changeMode(mode.id, option)}
                >
                  {describeMode(option)}
                </button>
              ))}
            </div>
          </div>
        ))}

        {controls.map((control) => (
          <Slider
            key={control.id}
            label={control.label}
            tag="câmera"
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value}
            unit={control.unit}
            onChange={(value) => changeControl(control.id, value)}
          />
        ))}

        {softwareControls.map((fallback) => (
          <Slider
            key={fallback.id}
            label={fallback.label}
            tag="software"
            min={0.3}
            max={2}
            step={0.01}
            value={settings[fallback.setting]}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(value) => changeSoftware(fallback.setting, value)}
          />
        ))}

        <div className="panel__label" style={{ marginTop: 18 }}>
          Predefinições
        </div>
        {presets.length === 0 && (
          <p className="panel__empty">
            Salve um conjunto de ajustes com nome para trocar de objetiva num clique.
          </p>
        )}
        {presets.map((preset) => (
          <div className="preset" key={preset.id}>
            <button
              type="button"
              className="preset__apply"
              onClick={() => void applyPreset(preset.data, controls)}
            >
              {preset.name}
            </button>
            <button
              type="button"
              className="preset__delete"
              title="Excluir predefinição"
              onClick={() => {
                void window.microazz.presets.remove(preset.id).then(() => {
                  setPresets((list) => list.filter((p) => p.id !== preset.id))
                })
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div className="panel__save">
          <input
            className="panel__input"
            placeholder="Ex.: Objetiva 40x"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNamed()
            }}
          />
          <button type="button" className="panel__savebtn" onClick={saveNamed} title="Salvar">
            <Save size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function Slider({
  label,
  tag,
  min,
  max,
  step,
  value,
  unit,
  format,
  onChange
}: {
  label: string
  tag: 'câmera' | 'software'
  min: number
  max: number
  step: number
  value: number
  unit?: string
  format?: (value: number) => string
  onChange: (value: number) => void
}): React.JSX.Element {
  const shown = format ? format(value) : `${round(value)}${unit ? ` ${unit}` : ''}`

  return (
    <div className="panel__group">
      <div className="panel__label">
        {label}
        <span className={`panel__tag ${tag === 'software' ? 'panel__tag--sw' : ''}`}>{tag}</span>
        <span className="panel__value">{shown}</span>
      </div>
      <input
        type="range"
        className="panel__slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function round(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100
}
