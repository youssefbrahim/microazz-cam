/**
 * Atalhos de teclado.
 *
 * Um "acelerador" é o texto que descreve a combinação, no formato que o
 * Electron entende: `F2`, `Space`, `Ctrl+G`, `Shift+F13`. O mesmo texto é usado
 * para registrar o atalho global no Windows e para reconhecer a tecla dentro da
 * janela, então as duas metades nunca saem de sincronia.
 */

export type ShortcutAction =
  | 'photo'
  | 'video'
  | 'freeze'
  | 'patient'
  | 'gallery'
  | 'fullscreen'

export interface ShortcutBinding {
  action: ShortcutAction
  accelerator: string
  /** Funciona mesmo com o Microazz Cam atrás de outra janela. */
  isGlobal: boolean
}

export const SHORTCUT_LABELS: Record<ShortcutAction, { label: string; hint: string }> = {
  photo: { label: 'Tirar foto', hint: 'A ação mais usada — é a que costuma ir para o pedal.' },
  video: { label: 'Iniciar / parar vídeo', hint: '' },
  freeze: { label: 'Congelar / voltar ao vivo', hint: '' },
  patient: { label: 'Trocar paciente ou exame', hint: '' },
  gallery: { label: 'Abrir a galeria', hint: '' },
  fullscreen: { label: 'Tela cheia', hint: '' }
}

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { action: 'photo', accelerator: 'Space', isGlobal: false },
  { action: 'video', accelerator: 'F2', isGlobal: false },
  { action: 'freeze', accelerator: 'F3', isGlobal: false },
  { action: 'patient', accelerator: 'F4', isGlobal: false },
  { action: 'gallery', accelerator: 'Ctrl+G', isGlobal: false },
  { action: 'fullscreen', accelerator: 'F11', isGlobal: false }
]

/**
 * Teclas que não podem virar atalho global: ou o Windows já as usa, ou
 * capturá-las deixaria o computador inutilizável.
 */
const FORBIDDEN_GLOBAL = new Set(['Ctrl+Alt+Delete', 'Alt+Tab', 'Ctrl+Shift+Escape', 'Super'])

/**
 * O mínimo que precisamos de um evento de teclado. Descrito assim, e não como
 * `KeyboardEvent`, para o processo principal (que não tem as definições do
 * navegador) usar as mesmas funções — e para testá-las sem abrir uma janela.
 */
export interface KeyPress {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** Converte a tecla pressionada no navegador para o formato do Electron. */
export function eventToAccelerator(event: KeyPress): string | null {
  const key = codeToAcceleratorKey(event.code)
  if (!key) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  parts.push(key)
  return parts.join('+')
}

/** Verdadeiro quando a tecla pressionada corresponde ao atalho. */
export function matchesAccelerator(event: KeyPress, accelerator: string): boolean {
  return eventToAccelerator(event) === accelerator
}

export function isValidAccelerator(accelerator: string): boolean {
  if (!accelerator || FORBIDDEN_GLOBAL.has(accelerator)) return false
  const parts = accelerator.split('+')
  const key = parts[parts.length - 1]
  // Um modificador sozinho não é atalho.
  return key !== '' && !['Ctrl', 'Alt', 'Shift', 'Super'].includes(key)
}

/** Como o atalho é mostrado na tela (`Ctrl+G` continua `Ctrl+G`, `Space` vira `Espaço`). */
export function describeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      switch (part) {
        case 'Space':
          return 'Espaço'
        case 'Return':
          return 'Enter'
        case 'Escape':
          return 'Esc'
        case 'Up':
          return '↑'
        case 'Down':
          return '↓'
        case 'Left':
          return '←'
        case 'Right':
          return '→'
        default:
          return part
      }
    })
    .join(' + ')
}

/**
 * `event.code` → nome que o Electron aceita.
 *
 * F13 a F24 aparecem aqui de propósito: pedais USB programáveis costumam ser
 * configurados nessas teclas justamente por não colidirem com nada.
 */
function codeToAcceleratorKey(code: string): string | null {
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`

  switch (code) {
    case 'Space':
      return 'Space'
    case 'Enter':
    case 'NumpadEnter':
      return 'Return'
    case 'Tab':
      return 'Tab'
    case 'Backspace':
      return 'Backspace'
    case 'Delete':
      return 'Delete'
    case 'Insert':
      return 'Insert'
    case 'Home':
      return 'Home'
    case 'End':
      return 'End'
    case 'PageUp':
      return 'PageUp'
    case 'PageDown':
      return 'PageDown'
    case 'Escape':
      return 'Escape'
    case 'ArrowUp':
      return 'Up'
    case 'ArrowDown':
      return 'Down'
    case 'ArrowLeft':
      return 'Left'
    case 'ArrowRight':
      return 'Right'
    case 'NumpadAdd':
      return 'numadd'
    case 'NumpadSubtract':
      return 'numsub'
    case 'NumpadMultiply':
      return 'nummult'
    case 'NumpadDivide':
      return 'numdiv'
    case 'NumpadDecimal':
      return 'numdec'
    case 'Minus':
      return '-'
    case 'Equal':
      return '='
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Backslash':
      return '\\'
    case 'Semicolon':
      return ';'
    case 'Quote':
      return "'"
    case 'Comma':
      return ','
    case 'Period':
      return '.'
    case 'Slash':
      return '/'
    case 'Backquote':
      return '`'
    default:
      return null
  }
}
