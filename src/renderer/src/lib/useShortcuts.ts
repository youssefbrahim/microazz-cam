import { useEffect, useMemo } from 'react'
import { eventToAccelerator, type ShortcutAction } from '@shared/shortcuts'
import { parsePedalConfig } from '@shared/pedal'
import { emitAction, onAction } from './actions'
import { usePedal } from './pedal'
import { useApp } from '../store'

/**
 * Liga o teclado às ações do programa.
 *
 * Atalhos marcados como globais são registrados no Windows pelo processo
 * principal e chegam por mensagem; os demais são reconhecidos aqui mesmo,
 * enquanto a janela estiver em foco. Nos dois casos a ação sai pelo mesmo
 * canal (`emitAction`), então pedal, tecla e botão fazem exatamente o mesmo.
 */
export function useShortcuts(): void {
  const bindings = useApp((s) => s.shortcuts)
  const goTo = useApp((s) => s.goTo)
  const pedalJson = useApp((s) => s.settings.pedalConfig)

  // Pedais que não enviam tecla (joystick ou HID puro) são lidos à parte, mas
  // desembocam nas mesmas ações.
  const pedal = useMemo(() => parsePedalConfig(pedalJson), [pedalJson])
  usePedal(pedal)

  // Teclas pressionadas com a janela em foco.
  useEffect(() => {
    const local = bindings.filter((b) => !b.isGlobal)

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return

      // Enquanto o usuário digita num campo, o teclado é dele.
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }

      const pressed = eventToAccelerator(event)
      if (!pressed) return

      const match = local.find((b) => b.accelerator === pressed)
      if (!match) return

      event.preventDefault()
      emitAction(match.action)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bindings])

  // Atalhos globais, acionados pelo Windows mesmo com o app em segundo plano.
  useEffect(() => window.microazz.shortcuts.onTrigger(emitAction), [])

  // Ações que valem em qualquer tela.
  useEffect(
    () =>
      onAction((action: ShortcutAction) => {
        if (action === 'gallery') goTo('gallery')
        if (action === 'fullscreen') void window.microazz.app.toggleFullscreen()
      }),
    [goTo]
  )
}
