import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Gamepad2, Usb, X } from 'lucide-react'
import { DEFAULT_PEDAL, type PedalButtonBinding, type PedalConfig } from '@shared/pedal'
import {
  describeAccelerator,
  eventToAccelerator,
  isValidAccelerator,
  SHORTCUT_LABELS,
  type ShortcutAction
} from '@shared/shortcuts'
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

  /*
   * A ação que está sendo aprendida também vai para uma ref.
   *
   * O ouvinte do HID é preso ao dispositivo uma vez só, quando o usuário
   * conecta — e naquele instante ninguém está aprendendo nada. Lendo o estado
   * pela closure, o ouvinte preso ficava com `learning` valendo nulo para
   * sempre: o sinal do pedal chegava, aparecia em "último sinal recebido" e era
   * descartado logo em seguida. Era o pedal que "não ensinava nada".
   */
  const learningRef = useRef<ShortcutAction | null>(null)
  learningRef.current = learning

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
    // `learning` não entra: quem lê a ação do momento é `learningRef`, e
    // recomeçar o laço a cada clique em "Aprender" perderia o estado anterior
    // dos botões — o primeiro quadro depois do reinício veria o pedal já
    // pisado como se fosse uma descida nova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
    // Sem dependências de propósito: este ouvinte fica preso ao dispositivo do
    // começo ao fim, e o que ele precisa saber do momento vem de `learningRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
    const action = learningRef.current
    if (!action) return

    setConfig((current) => {
      const buttons: PedalButtonBinding[] = current.buttons
        .filter((b) => b.id !== id && b.action !== action)
        .concat({ id, action })
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

  /*
   * Pedal que envia tecla dentro do assistente.
   *
   * É o tipo mais comum, e o assistente é justamente o lugar errado para ele:
   * nem joystick nem HID enxergam uma tecla, então a tela ficava muda e a
   * impressão era de que o programa não aprendia nada. Se chegar uma tecla
   * aqui, dizemos o que ela é e para onde ir.
   */
  const [keyboardPedal, setKeyboardPedal] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      const accelerator = eventToAccelerator(event)
      if (accelerator && isValidAccelerator(accelerator)) {
        setKeyboardPedal(describeAccelerator(accelerator))
      }
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
          {keyboardPedal && (
            <div className="wizard__keyboard">
              <strong>Este pedal envia a tecla {keyboardPedal}.</strong>
              <span>
                Ele é um pedal-teclado — o tipo mais comum — e não precisa deste assistente. Feche
                aqui, clique na tecla ao lado da ação desejada em <strong>Atalhos de teclado</strong>{' '}
                e pise no pedal: o programa grava a tecla na hora. Um pedal com dois botões manda
                uma tecla diferente em cada um, então dá para colocar foto num e vídeo no outro.
              </span>
            </div>
          )}

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
