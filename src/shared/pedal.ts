import type { ShortcutAction } from './shortcuts'

/**
 * Pedal USB.
 *
 * Há três tipos no mercado, e o programa cobre os três:
 *
 * 1. **Pedal-teclado** — a maioria. Ele se apresenta ao Windows como um teclado
 *    e envia uma tecla (com frequência F13–F24, que não colidem com nada). Não
 *    precisa de nada especial: é configurado como um atalho comum, e por isso
 *    nem aparece neste arquivo.
 * 2. **Pedal-joystick** — visto como controle de jogo. Lido pela API de
 *    Gamepad, que só entrega eventos com a janela em foco.
 * 3. **Pedal HID puro** — não envia tecla nenhuma. Lido byte a byte por WebHID,
 *    que funciona mesmo com o programa em segundo plano.
 */

export interface PedalButtonBinding {
  /**
   * Identificação do botão dentro do dispositivo.
   * Joystick: `b0`, `b1`… · HID: `<relatório>:<byte>:<valor>`.
   */
  id: string
  action: ShortcutAction
}

export interface PedalConfig {
  mode: 'none' | 'gamepad' | 'hid'
  /** Só para HID: qual dispositivo reabrir nas próximas execuções. */
  device?: { vendorId: number; productId: number; name: string }
  buttons: PedalButtonBinding[]
}

export const DEFAULT_PEDAL: PedalConfig = { mode: 'none', buttons: [] }

/** Lê a configuração guardada, caindo no padrão se estiver vazia ou corrompida. */
export function parsePedalConfig(json: string): PedalConfig {
  if (!json) return DEFAULT_PEDAL
  try {
    const parsed = JSON.parse(json) as Partial<PedalConfig>
    if (parsed.mode !== 'gamepad' && parsed.mode !== 'hid') return DEFAULT_PEDAL
    return {
      mode: parsed.mode,
      device: parsed.device,
      buttons: Array.isArray(parsed.buttons)
        ? parsed.buttons.filter(
            (b): b is PedalButtonBinding => typeof b?.id === 'string' && typeof b?.action === 'string'
          )
        : []
    }
  } catch {
    return DEFAULT_PEDAL
  }
}

export function describePedal(config: PedalConfig): string {
  if (config.mode === 'none' || config.buttons.length === 0) {
    return 'Nenhum pedal configurado'
  }
  const tipo = config.mode === 'gamepad' ? 'joystick' : 'HID'
  const nome = config.device?.name ? ` (${config.device.name})` : ''
  return `Pedal ${tipo}${nome} · ${config.buttons.length} botão(ões)`
}
