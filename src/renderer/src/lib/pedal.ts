import { useEffect } from 'react'
import type { PedalConfig } from '@shared/pedal'
import { emitAction } from './actions'

/**
 * Leitura do pedal em funcionamento (joystick e HID).
 *
 * Pedais que enviam tecla não passam por aqui — para o programa eles são um
 * atalho de teclado comum, e é assim que devem ser configurados.
 */

/** Escuta o pedal e dispara as ações enquanto o componente estiver montado. */
export function usePedal(config: PedalConfig): void {
  useEffect(() => {
    if (config.mode === 'gamepad') return listenGamepad(config)
    if (config.mode === 'hid') return listenHid(config)
    return undefined
  }, [config])
}

// --- Joystick ---

/**
 * A API de Gamepad não avisa quando um botão muda: é preciso perguntar a cada
 * quadro e comparar com o estado anterior. Ela também só responde com a janela
 * em foco — por isso o assistente avisa que este modo não vale em segundo plano.
 */
function listenGamepad(config: PedalConfig): () => void {
  const previous = new Map<string, boolean>()
  let raf = 0

  const poll = (): void => {
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue
      pad.buttons.forEach((button, index) => {
        const id = `b${index}`
        const wasDown = previous.get(id) ?? false
        const isDown = button.pressed
        previous.set(id, isDown)

        // Só a descida conta; segurar o pedal não dispara em rajada.
        if (isDown && !wasDown) {
          const binding = config.buttons.find((b) => b.id === id)
          if (binding) emitAction(binding.action)
        }
      })
    }
    raf = requestAnimationFrame(poll)
  }

  raf = requestAnimationFrame(poll)
  return () => cancelAnimationFrame(raf)
}

// --- HID puro ---

function listenHid(config: PedalConfig): () => void {
  let device: HIDDevice | null = null
  let disposed = false
  const previous = new Map<string, boolean>()

  const onInputReport = (event: HIDInputReportEvent): void => {
    const bytes = new Uint8Array(event.data.buffer)

    for (const binding of config.buttons) {
      const [reportId, byteIndex, value] = binding.id.split(':').map(Number)
      if (event.reportId !== reportId) continue

      const isDown = bytes[byteIndex] === value
      const wasDown = previous.get(binding.id) ?? false
      previous.set(binding.id, isDown)

      if (isDown && !wasDown) emitAction(binding.action)
    }
  }

  void (async () => {
    try {
      const wanted = config.device
      if (!wanted) return

      const devices = await navigator.hid.getDevices()
      const found = devices.find(
        (d) => d.vendorId === wanted.vendorId && d.productId === wanted.productId
      )
      if (!found || disposed) return

      if (!found.opened) await found.open()
      if (disposed) {
        await found.close()
        return
      }

      device = found
      device.addEventListener('inputreport', onInputReport)
    } catch {
      // Pedal desconectado ou permissão revogada: o programa segue sem ele.
    }
  })()

  return () => {
    disposed = true
    device?.removeEventListener('inputreport', onInputReport)
    void device?.close().catch(() => undefined)
  }
}

/**
 * Compara dois relatórios HID e devolve o identificador do byte que mudou.
 * É assim que o assistente "aprende" qual byte corresponde a cada pedal, sem
 * precisar conhecer o modelo.
 */
export function diffHidReport(
  reportId: number,
  before: Uint8Array,
  after: Uint8Array
): string | null {
  const length = Math.min(before.length, after.length)
  for (let i = 0; i < length; i++) {
    if (before[i] !== after[i]) return `${reportId}:${i}:${after[i]}`
  }
  return null
}
