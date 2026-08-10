import { app, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logFilePath } from './log.js'
import { dbPath, userDataDir } from './paths.js'
import { diskSpace, mediaRoot } from './storage.js'
import { queryAll } from './db/connection.js'
import { accountStatus } from './google/oauth.js'

/**
 * Relatório de diagnóstico.
 *
 * Gera um arquivo de texto na Área de Trabalho que o usuário anexa num e-mail
 * de suporte. Texto puro em vez de .zip de propósito: abre em qualquer lugar,
 * dá para ler antes de mandar (nenhuma foto de paciente vai junto) e não exige
 * nenhuma biblioteca extra no instalador.
 */

const LOG_TAIL_LINES = 400

export function writeDiagnostics(): string {
  const lines: string[] = []
  const add = (label: string, value: unknown): void => {
    lines.push(`${label}: ${String(value)}`)
  }

  lines.push('=== MICROAZZ CAM — DIAGNÓSTICO ===')
  add('Gerado em', new Date().toLocaleString('pt-BR'))
  lines.push('')

  lines.push('--- Versões ---')
  add('Microazz Cam', app.getVersion())
  add('Electron', process.versions.electron)
  add('Node', process.versions.node)
  add('Chromium', process.versions.chrome)
  add('Windows', `${process.platform} ${process.arch}`)
  lines.push('')

  lines.push('--- Pastas ---')
  add('Dados do programa', userDataDir())
  add('Banco de dados', `${dbPath()} (${existsSync(dbPath()) ? 'existe' : 'AUSENTE'})`)
  try {
    const root = mediaRoot()
    const space = diskSpace(root)
    add('Capturas', root)
    add(
      'Espaço livre',
      `${(space.freeBytes / 1024 ** 3).toFixed(1)} GB de ${(space.totalBytes / 1024 ** 3).toFixed(1)} GB`
    )
  } catch (err) {
    add('Capturas', `ERRO ao ler: ${String(err)}`)
  }
  lines.push('')

  lines.push('--- Conteúdo ---')
  try {
    const totals = queryAll<{ rotulo: string; total: number }>(
      "SELECT 'pacientes' AS rotulo, COUNT(*) AS total FROM patients WHERE is_system = 0 " +
        "UNION ALL SELECT 'exames', COUNT(*) FROM exams " +
        "UNION ALL SELECT 'fotos', COUNT(*) FROM media WHERE kind = 'photo' " +
        "UNION ALL SELECT 'vídeos', COUNT(*) FROM media WHERE kind = 'video'"
    )
    for (const row of totals) add(row.rotulo, row.total)

    const queue = queryAll<{ state: string; total: number }>(
      'SELECT state, COUNT(*) AS total FROM upload_queue GROUP BY state'
    )
    add('fila do Drive', queue.length ? queue.map((q) => `${q.state}=${q.total}`).join(', ') : 'vazia')
  } catch (err) {
    add('banco', `ERRO ao consultar: ${String(err)}`)
  }
  lines.push('')

  lines.push('--- Google Drive ---')
  const account = accountStatus()
  add('Credenciais preenchidas', account.configured ? 'sim' : 'NÃO')
  add('Conta conectada', account.connected ? account.email || 'sim' : 'não')
  lines.push('')

  lines.push(`--- Últimas ${LOG_TAIL_LINES} linhas do registro ---`)
  try {
    const content = readFileSync(logFilePath(), 'utf-8').split(/\r?\n/)
    lines.push(...content.slice(-LOG_TAIL_LINES))
  } catch (err) {
    lines.push(`(não foi possível ler o registro: ${String(err)})`)
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const target = join(app.getPath('desktop'), `microazz-cam-diagnostico-${stamp}.txt`)
  writeFileSync(target, lines.join('\r\n'), 'utf-8')
  return target
}

export async function writeAndRevealDiagnostics(): Promise<string> {
  const target = writeDiagnostics()
  shell.showItemInFolder(target)
  return target
}
