import { app, BrowserWindow, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { log } from './log.js'

/**
 * Atualização automática pelo GitHub Releases.
 *
 * O programa confere ao abrir e a cada quatro horas, baixa em segundo plano e
 * instala quando o usuário fechar. Nada é instalado no meio de um atendimento.
 */

const { autoUpdater } = electronUpdater

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export function setupUpdater(window: BrowserWindow): void {
  // Em desenvolvimento não há release para comparar.
  if (!app.isPackaged) {
    log.info('atualização automática desligada (executando a partir do código-fonte)')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  // Instalar no meio do uso perderia a gravação em andamento.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    log.info('atualização disponível', { versao: info.version })
    send(window, 'update:available', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('atualização baixada', { versao: info.version })
    send(window, 'update:ready', info.version)
  })

  autoUpdater.on('error', (err) => {
    // Falha ao verificar não é motivo para incomodar o usuário: ele continua
    // trabalhando na versão atual.
    log.warn('falha na verificação de atualização', err)
  })

  void autoUpdater.checkForUpdates().catch(() => undefined)
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }, CHECK_INTERVAL_MS)
}

function send(window: BrowserWindow, channel: string, version: string): void {
  if (!window.isDestroyed()) window.webContents.send(channel, version)
}

/** Instala agora, a pedido do usuário. */
export async function installUpdateNow(window: BrowserWindow): Promise<void> {
  const answer = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['Reiniciar e atualizar', 'Depois'],
    defaultId: 0,
    cancelId: 1,
    title: 'Atualizar o Microazz Cam',
    message: 'O programa vai fechar e abrir de novo já atualizado.',
    detail: 'Certifique-se de que não há gravação em andamento.'
  })

  if (answer.response === 0) autoUpdater.quitAndInstall()
}
