import { BrowserWindow, globalShortcut } from 'electron'
import {
  DEFAULT_SHORTCUTS,
  isValidAccelerator,
  type ShortcutAction,
  type ShortcutBinding
} from '@shared/shortcuts'
import { getDatabase, queryAll, transaction } from './db/connection.js'
import { log } from './log.js'

/**
 * Atalhos de teclado.
 *
 * Cada atalho tem uma chave "global": ligada, ele é registrado no Windows e
 * funciona mesmo com o Microazz Cam atrás do prontuário eletrônico; desligada,
 * vale só com a janela em foco (e quem trata é a própria interface).
 */

interface ShortcutRow {
  action: string
  accelerator: string
  is_global: number
}

export function readShortcuts(): ShortcutBinding[] {
  const rows = queryAll<ShortcutRow>('SELECT * FROM shortcuts')
  const stored = new Map(rows.map((r) => [r.action, r]))

  return DEFAULT_SHORTCUTS.map((fallback) => {
    const row = stored.get(fallback.action)
    return row && isValidAccelerator(row.accelerator)
      ? { action: fallback.action, accelerator: row.accelerator, isGlobal: row.is_global === 1 }
      : fallback
  })
}

export function writeShortcuts(bindings: ShortcutBinding[]): ShortcutBinding[] {
  const known = new Set(DEFAULT_SHORTCUTS.map((s) => s.action))
  const statement = getDatabase().prepare(
    'INSERT INTO shortcuts (action, accelerator, is_global) VALUES (?, ?, ?) ' +
      'ON CONFLICT (action) DO UPDATE SET accelerator = excluded.accelerator, is_global = excluded.is_global'
  )

  transaction(() => {
    for (const binding of bindings) {
      if (!known.has(binding.action)) continue
      if (!isValidAccelerator(binding.accelerator)) continue
      statement.run(binding.action, binding.accelerator, binding.isGlobal ? 1 : 0)
    }
  })

  return readShortcuts()
}

/**
 * Registra no Windows os atalhos marcados como globais.
 *
 * Um atalho global pode falhar porque outro programa já o tomou — nesse caso
 * avisamos, em vez de o usuário achar que o pedal quebrou.
 */
export function applyGlobalShortcuts(window: BrowserWindow | null): string[] {
  globalShortcut.unregisterAll()
  if (!window || window.isDestroyed()) return []

  const failed: string[] = []

  for (const binding of readShortcuts()) {
    if (!binding.isGlobal) continue

    const ok = globalShortcut.register(binding.accelerator, () => {
      trigger(window, binding.action)
    })

    if (!ok) {
      failed.push(binding.accelerator)
      log.warn('atalho global recusado pelo Windows', { accelerator: binding.accelerator })
    }
  }

  return failed
}

function trigger(window: BrowserWindow, action: ShortcutAction): void {
  if (window.isDestroyed()) return
  // Traz a janela para a frente nas ações que precisam ser vistas.
  if (action === 'patient' || action === 'gallery') {
    if (window.isMinimized()) window.restore()
    window.focus()
  }
  window.webContents.send('shortcut:trigger', action)
}

export function releaseGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
