import type { ShortcutAction } from '@shared/shortcuts'

/**
 * Canal único por onde passam as ações do usuário.
 *
 * Tanto faz se a ação veio de um clique no botão, de uma tecla dentro da
 * janela, de um atalho global do Windows ou de uma pisada no pedal: tudo entra
 * por aqui, e quem executa é sempre o mesmo código. Isso evita a armadilha de o
 * pedal fazer uma coisa e o botão fazer outra ligeiramente diferente.
 */

type Handler = (action: ShortcutAction) => void

const handlers = new Set<Handler>()

export function onAction(handler: Handler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function emitAction(action: ShortcutAction): void {
  for (const handler of [...handlers]) handler(action)
}
