import log from 'electron-log/main.js'
import { app } from 'electron'

/**
 * Log em arquivo, para o usuário conseguir mandar um diagnóstico quando algo
 * der errado. Fica em %APPDATA%\microazz-cam\logs\main.log.
 */
export function setupLogging(): void {
  log.initialize()
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 10 * 1024 * 1024 // 10 MB, depois rotaciona
  log.transports.console.level = app.isPackaged ? false : 'debug'

  // Qualquer erro não tratado vai parar no arquivo em vez de sumir.
  process.on('uncaughtException', (err) => log.error('uncaughtException', err))
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection', reason))

  log.info('--- Microazz Cam iniciando ---')
  log.info('versões', {
    app: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chromium: process.versions.chrome
  })
}

export function logFilePath(): string {
  return log.transports.file.getFile().path
}

export { log }
