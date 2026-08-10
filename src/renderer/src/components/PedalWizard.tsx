import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Gamepad2, Usb, X } from 'lucide-react'
import { DEFAULT_PEDAL, type PedalButtonBinding, type PedalConfig } from '@shared/pedal'
import { SHORTCUT_LABELS, type ShortcutAction } from '@shared/shortcuts'
import { diffHidReport } from '../lib/pedal'
import { useApp } from '../store'
import './PedalWizard.css'

/**
 * Assistente "Aprender pedal", para os pedais que não enviam tecla.
 *
 * O programa não conhece o modelo do pedal e não precisa conhecer: ele observa
 * o que muda quando você pisa e guarda essa diferença. Funciona com pedal
 * visto como joystick e com pedal HID puro.
 */

const ASSIGNABLE: ShortcutAction[] = ['photo', 'video', 'freeze', 'patient']

export function PedalWizard({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)

  const [mode, setMode] = useState<'choose' | 'gamepad' | 'hid'>('choose')
  const [config, setConfig] = useState<PedalConfig>(DEFAULT_PEDAL)
  const [learning, setLearning] = useState<ShortcutAction | null>(null)
  const [detected, setDetected] = useState('')

  // --- Modo joystick ---

  const gamepadPrev = useRef(new Map<string, boolean>())

  useEffect(() => {
    if (mode !== 'gamepad') return
    let raf = 0

    const poll = (): void => {
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue
        pad.buttons.forEach((button, index) => {
          const id = `b${index}`
          const wasDown = gamepadPrev.current.get(id) ?? false
          gamepadPrev.current.set(id, button.pressed)
          if (button.pressed && !wasDown) captureButton(id)
        })
      }
      raf = requestAnimationFrame(poll)
    }

    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, learning])

  // --- Modo HID puro ---

  const hidDeviceRef = useRef<HIDDevice | null>(null)
  const lastReport = useRef(new Map<number, Uint8Array>())
  const [hidDevices, setHidDevices] = useState<
    Array<{ deviceId: string; name: string; vendorId: number; productId: number }>
  >([])

  useEffect(() => window.microazz.hid.onDevices(setHidDevices), [])

  const onInputReport = useCallback(
    (event: HIDInputReportEvent): void => {
      const bytes = new Uint8Array(event.data.buffer)
      const before = lastReport.current.get(event.reportId)
      lastReport.current.set(event.reportId, bytes)
      if (!before) return

      const id = diffHidReport(event.reportId, before, bytes)
      if (id) captureButton(id)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [learning]
  )

  const connectHid = useCallback(async (): Promise<void> => {
    try {
      // Dispara a escolha: o processo principal manda a lista para cá.
      const devices = await navigator.hid.requestDevice({ filters: [] })
      const device = devices[0]
      if (!device) return

      if (!device.opened) await device.open()
      hidDeviceRef.current?.removeEventListener('inputreport', onInputReport)
      hidDeviceRef.current = device
      device.addEventListener('inputreport', onInputReport)

      setConfig((current) => ({
        ...current,
        mode: 'hid',
        device: {
          vendorId: device.vendorId,
          productId: device.productId,
          name: device.productName || 'Pedal USB'
        }
      }))
      setMode('hid')
      notify(`Conectado a ${device.productName || 'pedal USB'}. Agora pise no pedal.`)
    } catch {
      notify('Nenhum dispositivo foi escolhido.', 'error')
    }
  }, [notify, onInputReport])

  useEffect(() => {
    return () => {
      const device = hidDeviceRef.current
      device?.removeEventListener('inputreport', onInputReport)
      void device?.close().catch(() => undefined)
    }
  }, [onInputReport])

  // --- Aprendizado ---

  function captureButton(id: string): void {
    setDetected(id)
    if (!learning) return

    setConfig((current) => {
      const buttons: PedalButtonBinding[] = current.buttons
        .filter((b) => b.id !== id && b.action !== learning)
        .concat({ id, action: learning })
      return { ...current, mode: current.mode === 'none' ? 'gamepad' : current.mode, buttons }
    })
    setLearning(null)
  }

  const save = useCallback((): void => {
    if (config.buttons.length === 0) {
      notify('Aprenda pelo menos um botão antes de salvar.', 'error')
      return
    }
    void updateSettings({ pedalConfig: JSON.stringify(config) }).then(() => {
      notify('Pedal configurado.')
      onClose()
    })
  }, [config, notify, onClose, updateSettings])

  const forget = useCallback((): void => {
    void updateSettings({ pedalConfig: '' }).then(() => {
      notify('Configuração do pedal apagada.')
      onClose()
    })
  }, [notify, onClose, updateSettings])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="picker__backdrop" onPointerDown={onClose}>
      <div
        className="wizard"
        role="dialog"
        aria-label="Assistente de pedal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="picker__head">
          <strong>Assistente de pedal</strong>
          <button type="button" className="picker__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="wizard__body">
          {mode === 'choose' && (
            <>
              <p className="hint hint--dark">
                Primeiro, tente o caminho simples: feche este assistente, clique na tecla da ação
                desejada na lista de atalhos e <strong>pise no pedal</strong>. Se ele enviar uma
                tecla — o caso da maioria — está resolvido. Use as opções abaixo só se pisar não
                produzir nada.
              </p>

              <button type="button" className="wizard__option" onClick={() => setMode('gamepad')}>
                <Gamepad2 size={20} />
                <span>
                  O pedal aparece como controle de jogo
                  <small>
                    Funciona só com a janela do Microazz Cam em primeiro plano — limitação do próprio
                    Windows.
                  </small>
                </span>
              </button>

              <button type="button" className="wizard__option" onClick={() => void connectHid()}>
                <Usb size={20} />
                <span>
                  O pedal não envia tecla nem aparece como controle
                  <small>
                    Leitura direta do dispositivo. Funciona mesmo com o programa em segundo plano.
                  </small>
                </span>
              </button>

              {settings.pedalConfig && (
                <button type="button" className="btn btn--danger" onClick={forget}>
                  Esquecer o pedal configurado
                </button>
              )}
            </>
          )}

          {(mode === 'gamepad' || mode === 'hid') && (
            <>
              <p className="hint hint--dark">
                Clique em <strong>Aprender</strong> na ação desejada e{' '}
                <strong>pise no pedal</strong>. Repita para cada pedal que quiser usar.
              </p>

              {hidDevices.length > 0 && mode === 'hid' && (
                <div className="wizard__devices">
                  <span>Escolha o dispositivo:</span>
                  {hidDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      type="button"
                      className="btn"
                      onClick={() => void window.microazz.hid.select(device.deviceId)}
                    >
                      {device.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void window.microazz.hid.select(null)}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <div className="wizard__detected">
                {detected ? (
                  <>
                    Último sinal recebido: <code>{detected}</code>
                  </>
                ) : (
                  'Nenhum sinal recebido ainda. Pise no pedal para testar.'
                )}
              </div>

              {ASSIGNABLE.map((action) => {
                const bound = config.buttons.find((b) => b.action === action)
                return (
                  <div className="wizard__row" key={action}>
                    <span>{SHORTCUT_LABELS[action].label}</span>
                    <code className="wizard__bound">{bound ? bound.id : '—'}</code>
                    <button
                      type="button"
                      className={`btn ${learning === action ? 'btn--primary' : ''}`}
                      onClick={() => setLearning(learning === action ? null : action)}
                    >
                      {learning === action ? 'Pise agora…' : 'Aprender'}
                    </button>
                  </div>
                )
              })}

              <div className="btn-row" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn--primary" onClick={save}>
                  <Check size={16} /> Salvar pedal
                </button>
                <button type="button" className="btn" onClick={() => setMode('choose')}>
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
