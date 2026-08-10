import { net, protocol } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mediaRoot } from './storage.js'
import { log } from './log.js'

/**
 * Protocolo `mvfile://` para a interface exibir fotos e vídeos já gravados.
 *
 * A interface roda isolada e não pode abrir `file://` diretamente. Em vez de
 * afrouxar isso, servimos os arquivos por um endereço próprio que só entrega o
 * que está dentro da pasta de capturas — nada mais do disco fica exposto.
 */

export const MEDIA_SCHEME = 'mvfile'

/** Precisa ser chamado antes do app ficar pronto. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const requested = new URL(request.url).searchParams.get('p')
      if (!requested) return new Response('Caminho não informado.', { status: 400 })

      const filePath = resolve(requested)
      const root = resolve(mediaRoot())
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        log.warn('acesso a arquivo fora da pasta de capturas foi bloqueado', { filePath })
        return new Response('Acesso negado.', { status: 403 })
      }

      return await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
        bypassCustomProtocolHandlers: true
      })
    } catch (err) {
      log.warn('falha ao servir arquivo de mídia', err)
      return new Response('Arquivo não encontrado.', { status: 404 })
    }
  })
}
