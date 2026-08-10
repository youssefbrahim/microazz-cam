import { app, BrowserWindow, session } from 'electron'
import { setupLogging, log } from './log.js'
import { openDatabase, closeDatabase } from './db/connection.js'
import { createMainWindow } from './window.js'
import { registerIpc } from './ipc.js'
import { handleMediaProtocol, registerMediaScheme } from './fileProtocol.js'
import { closeOpenVideoSessions } from './capture.js'
import { applyGlobalShortcuts, releaseGlobalShortcuts } from './shortcuts.js'
import { configureHid } from './hid.js'
import { attachWindow, recoverInterrupted, scheduleRun } from './upload/queue.js'
import { setupUpdater } from './updater.js'

setupLogging()

// Precisa acontecer antes do app ficar pronto.
registerMediaScheme()

// Uma instância só. Se o usuário clicar no atalho de novo, trazemos a janela
// existente para a frente em vez de abrir um segundo programa disputando a câmera.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // Identifica o app para o Windows (barra de tarefas e notificações).
  app.setAppUserModelId('br.com.microazz.cam')

  app.whenReady().then(() => {
    openDatabase()
    handleMediaProtocol()
    registerIpc()
    configurePermissions()
    recoverInterrupted()

    mainWindow = createMainWindow()
    configureHid(session.defaultSession, mainWindow)
    applyGlobalShortcuts(mainWindow)
    attachWindow(mainWindow)

    setupUpdater(mainWindow)

    // Retoma o que ficou pendente da sessão anterior, sem atropelar a abertura.
    scheduleRun(4000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
        applyGlobalShortcuts(mainWindow)
      }
    })
  })

  // Atalhos globais precisam ser devolvidos ao Windows ao sair.
  app.on('will-quit', releaseGlobalShortcuts)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Se o usuário fechar o app no meio de uma gravação, fechamos o arquivo com
  // o que já foi para o disco em vez de deixar um vídeo quebrado para trás.
  let closingSessions = false
  app.on('before-quit', (event) => {
    if (!closingSessions) {
      closingSessions = true
      event.preventDefault()
      closeOpenVideoSessions()
        .catch((err: unknown) => log.warn('falha ao encerrar gravações', err))
        .finally(() => app.quit())
      return
    }
    closeDatabase()
    log.info('--- Microazz Cam encerrando ---')
  })
}

/**
 * O app só carrega a própria interface, mas deixamos explícito o que é
 * permitido: câmera, microfone e HID (o pedal). Tudo o mais é negado.
 */
function configurePermissions(): void {
  const allowed = new Set(['media', 'hid', 'fullscreen', 'clipboard-sanitized-write'])

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const ok = allowed.has(permission)
    if (!ok) log.warn('permissão negada', { permission })
    callback(ok)
  })

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}
