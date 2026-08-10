import { BrowserWindow, ipcMain, type Session } from 'electron'
import { log } from './log.js'

/**
 * Acesso ao pedal por HID.
 *
 * Pedais que se apresentam como teclado não passam por aqui — eles são tratados
 * como atalho normal. Este caminho existe para os pedais "HID puro", que não
 * enviam tecla nenhuma e precisam ser lidos byte a byte.
 *
 * O Electron não deixa a página escolher o dispositivo sozinha: quando a
 * interface chama `navigator.hid.requestDevice`, o pedido cai aqui, mandamos a
 * lista para a interface montar a janela de escolha e devolvemos o que o
 * usuário selecionar.
 */

interface PendingSelection {
  resolve: (deviceId: string | undefined) => void
}

let pending: PendingSelection | null = null

export function configureHid(session: Session, window: BrowserWindow): void {
  session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault()

    // Uma escolha de cada vez: a anterior é cancelada.
    pending?.resolve(undefined)
    pending = { resolve: callback }

    const devices = details.deviceList.map((device) => ({
      deviceId: device.deviceId,
      name: device.name || 'Dispositivo sem nome',
      vendorId: device.vendorId,
      productId: device.productId
    }))

    log.info('dispositivos HID oferecidos', { total: devices.length })
    if (!window.isDestroyed()) window.webContents.send('hid:devices', devices)
  })

  // O usuário desconectou o pedal enquanto a janela de escolha estava aberta.
  session.on('hid-device-removed', (_event, { device }) => {
    log.info('dispositivo HID removido', { name: device.name })
  })

  // Depois de escolhido, o dispositivo continua liberado nas próximas aberturas.
  session.setDevicePermissionHandler((details) => details.deviceType === 'hid')

  ipcMain.handle('hid:select', (_event, deviceId: string | null): void => {
    pending?.resolve(deviceId ?? undefined)
    pending = null
  })
}
