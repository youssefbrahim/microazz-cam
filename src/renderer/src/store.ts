import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AppInfo,
  type CaptureContextInfo,
  type Settings
} from '@shared/types'
import { DEFAULT_SHORTCUTS, type ShortcutBinding } from '@shared/shortcuts'

/**
 * Estado global da interface. Guarda o que veio do processo principal
 * (informações do app e configurações) e reenvia qualquer alteração para lá,
 * de modo que o banco é sempre a fonte da verdade.
 */

export type ScreenId = 'capture' | 'patients' | 'gallery' | 'settings' | 'manual'

interface AppState {
  ready: boolean
  screen: ScreenId
  info: AppInfo | null
  settings: Settings
  /** Paciente e exame que estão recebendo as capturas. */
  context: CaptureContextInfo | null
  /** Atalhos de teclado configurados. */
  shortcuts: ShortcutBinding[]
  /**
   * Modo "só a imagem": a janela ocupa o monitor inteiro e todo o restante da
   * interface sai de cena, deixando apenas a imagem ao vivo do microscópio.
   */
  fullscreen: boolean

  /** Mensagem curta no rodapé (ex.: "Foto salva"). */
  toast: { text: string; kind: 'info' | 'error' } | null

  load: () => Promise<void>
  goTo: (screen: ScreenId) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  refreshContext: () => Promise<void>
  setExam: (examId: number | null) => Promise<void>
  reloadShortcuts: () => Promise<void>
  setFullscreen: (value: boolean) => void
  notify: (text: string, kind?: 'info' | 'error') => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: 'capture',
  info: null,
  settings: DEFAULT_SETTINGS,
  context: null,
  shortcuts: DEFAULT_SHORTCUTS,
  fullscreen: false,
  toast: null,

  load: async () => {
    const [info, settings, context, shortcuts] = await Promise.all([
      window.microazz.app.info(),
      window.microazz.settings.read(),
      window.microazz.session.current(),
      window.microazz.shortcuts.read()
    ])
    set({ info, settings, context, shortcuts, ready: true })
  },

  reloadShortcuts: async () => {
    set({ shortcuts: await window.microazz.shortcuts.read() })
  },

  setFullscreen: (value) => {
    // Só a imagem ao vivo faz sentido em tela cheia; se o usuário estava em
    // outra tela, levamos ele para a captura em vez de mostrar uma tela vazia.
    set(value ? { fullscreen: true, screen: 'capture' } : { fullscreen: false })
  },

  goTo: (screen) => set({ screen }),

  refreshContext: async () => {
    set({ context: await window.microazz.session.current() })
  },

  setExam: async (examId) => {
    set({ context: await window.microazz.session.setExam(examId) })
  },

  updateSettings: async (patch) => {
    // Aplica na hora para a interface não "engasgar", e confirma com o que o
    // processo principal devolver depois de gravar.
    set({ settings: { ...get().settings, ...patch } })
    const saved = await window.microazz.settings.write(patch)
    set({ settings: saved })
  },

  notify: (text, kind = 'info') => {
    clearTimeout(toastTimer)
    set({ toast: { text, kind } })
    toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 6000 : 2500)
  }
}))
