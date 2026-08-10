import { existsSync, statfsSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiskSpace, SavedFile } from '@shared/types'
import { withCopyIndex } from '@shared/naming'
import { defaultMediaRoot, ensureDir } from './paths.js'
import { readSettings } from './db/settingsRepo.js'

/** Pasta raiz das capturas: a escolhida nas configurações ou Documentos\Microazz Cam. */
export function mediaRoot(): string {
  const configured = readSettings().mediaRoot.trim()
  return ensureDir(configured || defaultMediaRoot())
}

/**
 * Devolve um caminho que ainda não existe, acrescentando ` (2)`, ` (3)`… se
 * precisar. Duas fotos no mesmo segundo não podem sobrescrever uma à outra.
 */
export function uniquePath(dir: string, fileName: string): { filePath: string; fileName: string } {
  for (let i = 1; i < 1000; i++) {
    const candidate = withCopyIndex(fileName, i)
    const filePath = join(dir, candidate)
    if (!existsSync(filePath)) return { filePath, fileName: candidate }
  }
  throw new Error('Não foi possível gerar um nome de arquivo livre nesta pasta.')
}

/** Grava um arquivo novo (foto, laudo) na pasta indicada. */
export function saveBuffer(dir: string, fileName: string, data: Uint8Array): SavedFile {
  ensureDir(dir)
  const target = uniquePath(dir, fileName)
  writeFileSync(target.filePath, data)
  return { filePath: target.filePath, fileName: target.fileName, bytes: data.byteLength }
}

/**
 * Arquivo aberto para receber o vídeo em pedaços enquanto a gravação acontece.
 * Nada fica só na memória: se faltar energia no meio, o que já foi para o disco
 * continua lá.
 */
export class ChunkWriter {
  private handle: Awaited<ReturnType<typeof open>> | null = null
  private queue: Promise<void> = Promise.resolve()

  readonly filePath: string
  readonly fileName: string
  bytesWritten = 0

  private constructor(filePath: string, fileName: string) {
    this.filePath = filePath
    this.fileName = fileName
  }

  static async create(dir: string, fileName: string): Promise<ChunkWriter> {
    ensureDir(dir)
    const target = uniquePath(dir, fileName)
    const writer = new ChunkWriter(target.filePath, target.fileName)
    writer.handle = await open(target.filePath, 'w')
    return writer
  }

  /** Enfileira a escrita para que os pedaços cheguem ao disco em ordem. */
  write(chunk: Uint8Array): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (!this.handle) throw new Error('O arquivo de gravação já foi fechado.')
      await this.handle.write(chunk)
      this.bytesWritten += chunk.byteLength
    })
    return this.queue
  }

  async close(): Promise<SavedFile> {
    await this.queue
    if (this.handle) {
      await this.handle.sync()
      await this.handle.close()
      this.handle = null
    }
    return { filePath: this.filePath, fileName: this.fileName, bytes: this.bytesWritten }
  }
}

/** Espaço livre no disco onde as capturas são gravadas. */
export function diskSpace(dir = mediaRoot()): DiskSpace {
  const stats = statfsSync(dir)
  return {
    freeBytes: Number(stats.bavail) * Number(stats.bsize),
    totalBytes: Number(stats.blocks) * Number(stats.bsize)
  }
}
