import { BrowserWindow, app, shell, screen } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDataDir } from './paths.js'
import { log } from './log.js'

/** Guarda tamanho/posição da janela entre execuções. */
interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const STATE_FILE = () => join(userDataDir(), 'window-state.json')
const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: true }

function readState(): WindowState {
  try {
    const file = STATE_FILE()
    if (!existsSync(file)) return DEFAULT_STATE
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<WindowState>
    const state: WindowState = {
      width: Math.max(900, Number(parsed.width) || DEFAULT_STATE.width),
      height: Math.max(600, Number(parsed.height) || DEFAULT_STATE.height),
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      maximized: parsed.maximized !== false
    }
    // Se o monitor onde a janela estava não existe mais (notebook desacoplado
    // da TV da sala), ignoramos a posição salva para a janela não abrir fora da tela.
    if (state.x !== undefined && state.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea
        return (
          state.x! < b.x + b.width &&
          state.x! + state.width > b.x &&
          state.y! < b.y + b.height &&
          state.y! + state.height > b.y
        )
      })
      if (!visible) {
        state.x = undefined
        state.y = undefined
      }
    }
    return state
  } catch {
    return DEFAULT_STATE
  }
}

function saveState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized()
    }
    writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    log.warn('não foi possível salvar o estado da janela', err)
  }
}

export function createMainWindow(): BrowserWindow {
  const state = readState()

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0B1220',
    title: 'Microazz Cam',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // A imagem ao vivo é o coração do app: não deixamos o Chromium
      // suspender o processo quando a janela fica atrás de outra.
      backgroundThrottling: false
    }
  })

  if (state.maximized) win.maximize()

  win.on('ready-to-show', () => win.show())

  // A interface esconde a barra lateral em tela cheia, para a imagem do
  // microscópio ocupar o monitor inteiro. Ela precisa saber do estado real da
  // janela — que também muda pela tecla F11 do próprio Windows.
  //
  // O valor vai fixo em cada evento, e não lido de `isFullScreen()`: no Windows
  // esse método ainda devolve o estado anterior quando o evento dispara, e a
  // interface acabava sempre um passo atrás.
  const reportFullscreen = (value: boolean) => (): void => {
    if (!win.isDestroyed()) win.webContents.send('window:fullscreen', value)
  }
  win.on('enter-full-screen', reportFullscreen(true))
  win.on('leave-full-screen', reportFullscreen(false))

  let saveTimer: NodeJS.Timeout | undefined
  const scheduleSave = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveState(win), 400)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => {
    clearTimeout(saveTimer)
    saveState(win)
  })

  // Links externos abrem no navegador padrão, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}
