import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Onde cada coisa mora no disco.
 *
 *  - dados internos (banco, logs, tokens):  %APPDATA%\microazz-cam
 *  - capturas do usuário:                   Documentos\Microazz Cam
 *
 * Separar os dois é intencional: o usuário mexe (e faz backup) da pasta de
 * capturas; a pasta interna é do programa.
 */

export function userDataDir(): string {
  return app.getPath('userData')
}

export function dbPath(): string {
  return join(userDataDir(), 'microazz-cam.db')
}

/** Pasta padrão das capturas quando o usuário não escolheu outra. */
export function defaultMediaRoot(): string {
  return join(app.getPath('documents'), 'Microazz Cam')
}

/** Cria a pasta (e as pastas-pai) se ainda não existir. Devolve o caminho. */
export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
