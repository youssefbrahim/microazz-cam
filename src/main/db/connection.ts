import { DatabaseSync } from 'node:sqlite'
import { dbPath, ensureDir, userDataDir } from '../paths.js'
import { MIGRATIONS } from './migrations.js'
import { log } from '../log.js'

/**
 * Banco SQLite local. Usamos o SQLite que já vem embutido no Node do Electron
 * (`node:sqlite`) — sem módulo nativo para compilar, sem dependência extra.
 */

let db: DatabaseSync | null = null

export function openDatabase(): DatabaseSync {
  if (db) return db

  ensureDir(userDataDir())
  const file = dbPath()
  const database = new DatabaseSync(file)

  // WAL deixa leitura e escrita simultâneas rápidas e reduz o risco de
  // corromper o arquivo se o programa for fechado no meio de uma gravação.
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA synchronous = NORMAL')
  database.exec('PRAGMA foreign_keys = ON')

  runMigrations(database)

  db = database
  log.info('banco aberto', { file, versao: currentVersion(database) })
  return db
}

export function getDatabase(): DatabaseSync {
  if (!db) throw new Error('O banco ainda não foi aberto.')
  return db
}

export function closeDatabase(): void {
  if (!db) return
  try {
    db.close()
  } catch (err) {
    log.warn('falha ao fechar o banco', err)
  }
  db = null
}

function currentVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

function runMigrations(database: DatabaseSync): void {
  const from = currentVersion(database)
  if (from >= MIGRATIONS.length) return

  for (let i = from; i < MIGRATIONS.length; i++) {
    const version = i + 1
    database.exec('BEGIN')
    try {
      database.exec(MIGRATIONS[i])
      // user_version não aceita parâmetro ligado; o valor vem do índice do
      // array, nunca de entrada do usuário.
      database.exec(`PRAGMA user_version = ${version}`)
      database.exec('COMMIT')
      log.info(`migração ${version} aplicada`)
    } catch (err) {
      database.exec('ROLLBACK')
      log.error(`falha na migração ${version}`, err)
      throw err
    }
  }
}

/**
 * Consultas tipadas. O `node:sqlite` devolve linhas como mapas genéricos; estes
 * dois ajudantes concentram a conversão para os tipos de linha de `repos.ts`,
 * em vez de espalhar conversões por todo o arquivo.
 */
export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return getDatabase().prepare(sql).all(...params) as unknown as T[]
}

export function queryOne<T>(sql: string, ...params: SqlParam[]): T | null {
  return (getDatabase().prepare(sql).get(...params) as unknown as T | undefined) ?? null
}

export type SqlParam = string | number | bigint | null | Uint8Array

/** Executa várias escritas como uma transação só. */
export function transaction<T>(fn: () => T): T {
  const database = getDatabase()
  database.exec('BEGIN')
  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (err) {
    database.exec('ROLLBACK')
    throw err
  }
}

/** Versão do SQLite embutido — mostrada na tela de diagnóstico. */
export function sqliteVersion(): string {
  const row = getDatabase().prepare('SELECT sqlite_version() AS v').get() as { v: string }
  return row.v
}
