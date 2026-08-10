import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { getDatabase, transaction } from './connection.js'
import { log } from '../log.js'

/**
 * Configurações do app, guardadas como pares chave/valor (JSON) na tabela
 * `settings`. O que estiver faltando no banco cai no padrão de DEFAULT_SETTINGS,
 * então adicionar uma configuração nova não exige migração.
 */

export function readSettings(): Settings {
  const rows = getDatabase().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>

  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value)
    } catch {
      log.warn('configuração ilegível, usando o padrão', { chave: row.key })
    }
  }

  // Só aceitamos chaves conhecidas, e só se o tipo bater com o padrão. Isso
  // impede que um banco antigo ou editado à mão injete lixo na interface.
  const result = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = stored[key]
    if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
      result[key] = value as never
    }
  }
  return result
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const stmt = getDatabase().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value'
  )

  transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue
      if (value === undefined) continue
      stmt.run(key, JSON.stringify(value))
    }
  })

  return readSettings()
}
