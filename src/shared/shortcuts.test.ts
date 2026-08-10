import { describe, expect, it } from 'vitest'
import {
  describeAccelerator,
  eventToAccelerator,
  isValidAccelerator,
  matchesAccelerator,
  type KeyPress
} from './shortcuts'

/** Monta uma tecla pressionada como o navegador entregaria. */
function press(code: string, mods: Partial<KeyPress> = {}): KeyPress {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }
}

describe('eventToAccelerator', () => {
  it('converte letras e dígitos', () => {
    expect(eventToAccelerator(press('KeyG'))).toBe('G')
    expect(eventToAccelerator(press('Digit5'))).toBe('5')
  })

  it('converte teclas de função, inclusive as altas usadas por pedais', () => {
    expect(eventToAccelerator(press('F2'))).toBe('F2')
    expect(eventToAccelerator(press('F13'))).toBe('F13')
    expect(eventToAccelerator(press('F24'))).toBe('F24')
  })

  it('não inventa uma F25', () => {
    expect(eventToAccelerator(press('F25'))).toBeNull()
  })

  it('junta os modificadores na ordem que o Electron espera', () => {
    expect(eventToAccelerator(press('KeyG', { ctrlKey: true }))).toBe('Ctrl+G')
    expect(eventToAccelerator(press('F2', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+F2')
    expect(eventToAccelerator(press('KeyA', { altKey: true, metaKey: true }))).toBe('Alt+Super+A')
  })

  it('converte teclas especiais e do teclado numérico', () => {
    expect(eventToAccelerator(press('Space'))).toBe('Space')
    expect(eventToAccelerator(press('ArrowUp'))).toBe('Up')
    expect(eventToAccelerator(press('NumpadEnter'))).toBe('Return')
    expect(eventToAccelerator(press('Numpad7'))).toBe('num7')
  })

  it('ignora teclas que não viram atalho', () => {
    expect(eventToAccelerator(press('ControlLeft'))).toBeNull()
    expect(eventToAccelerator(press('CapsLock'))).toBeNull()
  })
})

describe('matchesAccelerator', () => {
  it('reconhece a tecla configurada', () => {
    expect(matchesAccelerator(press('F2'), 'F2')).toBe(true)
    expect(matchesAccelerator(press('KeyG', { ctrlKey: true }), 'Ctrl+G')).toBe(true)
  })

  it('não confunde a tecla com a mesma tecla acompanhada de modificador', () => {
    expect(matchesAccelerator(press('KeyG'), 'Ctrl+G')).toBe(false)
    expect(matchesAccelerator(press('F2', { shiftKey: true }), 'F2')).toBe(false)
  })
})

describe('isValidAccelerator', () => {
  it('recusa vazio e modificador solto', () => {
    expect(isValidAccelerator('')).toBe(false)
    expect(isValidAccelerator('Ctrl')).toBe(false)
    expect(isValidAccelerator('Ctrl+Shift')).toBe(false)
  })

  it('recusa combinações reservadas pelo Windows', () => {
    expect(isValidAccelerator('Ctrl+Alt+Delete')).toBe(false)
    expect(isValidAccelerator('Alt+Tab')).toBe(false)
  })

  it('aceita atalhos comuns', () => {
    expect(isValidAccelerator('Space')).toBe(true)
    expect(isValidAccelerator('F13')).toBe(true)
    expect(isValidAccelerator('Ctrl+G')).toBe(true)
  })
})

describe('describeAccelerator', () => {
  it('traduz o que o usuário vê', () => {
    expect(describeAccelerator('Space')).toBe('Espaço')
    expect(describeAccelerator('Ctrl+G')).toBe('Ctrl + G')
    expect(describeAccelerator('Escape')).toBe('Esc')
    expect(describeAccelerator('F13')).toBe('F13')
  })
})
