import { useEffect, useState } from 'react'
import {
  BookOpen,
  Camera,
  Download,
  Images,
  Maximize2,
  Microscope,
  Settings as SettingsIcon,
  Users
} from 'lucide-react'
import { describeAccelerator } from '@shared/shortcuts'
import { useApp, type ScreenId } from './store'
import { useShortcuts } from './lib/useShortcuts'
import { CaptureScreen } from './screens/CaptureScreen'
import { PatientsScreen } from './screens/PatientsScreen'
import { GalleryScreen } from './screens/GalleryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ManualScreen } from './screens/ManualScreen'
import './App.css'

const NAV: Array<{ id: ScreenId; label: string; hint: string; icon: typeof Camera }> = [
  { id: 'capture', label: 'Captura', hint: '', icon: Camera },
  { id: 'patients', label: 'Pacientes', hint: '', icon: Users },
  { id: 'gallery', label: 'Galeria', hint: 'Ctrl+G', icon: Images },
  { id: 'settings', label: 'Configurações', hint: '', icon: SettingsIcon },
  { id: 'manual', label: 'Manual', hint: '', icon: BookOpen }
]

export function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const screen = useApp((s) => s.screen)
  const toast = useApp((s) => s.toast)
  const load = useApp((s) => s.load)
  const notify = useApp((s) => s.notify)
  const fullscreen = useApp((s) => s.fullscreen)
  const setFullscreen = useApp((s) => s.setFullscreen)

  useShortcuts()

  useEffect(() => {
    load().catch((err: unknown) => {
      notify(`Falha ao iniciar: ${String(err)}`, 'error')
    })
  }, [load, notify])

  // O estado vem do processo principal, não de um contador local: a janela
  // também sai da tela cheia pelo F11 do Windows e pelo botão de fechar.
  useEffect(() => {
    void window.microazz.app.isFullscreen().then(setFullscreen)
    return window.microazz.app.onFullscreen(setFullscreen)
  }, [setFullscreen])

  // Esc sai da tela cheia — a não ser que haja uma janela aberta por cima, e aí
  // o Esc pertence a ela (fechar o visualizador não deve mudar a tela toda).
  useEffect(() => {
    if (!fullscreen) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      void window.microazz.app.toggleFullscreen()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  if (!ready) return <div className="boot">Carregando o Microazz Cam…</div>

  return (
    <div className={`app ${fullscreen ? 'app--fullscreen' : ''}`}>
      {!fullscreen && <Sidebar />}

      {/*
        As telas entram aqui direto, sem embrulho: um contêiner a mais entre o
        flex e a área rolável fazia a rolagem sumir, porque a altura deixava de
        ser limitada e o conteúdo simplesmente vazava para fora da janela.
      */}
      <div className="main">
        {screen === 'capture' && <CaptureScreen />}
        {screen === 'patients' && <PatientsScreen />}
        {screen === 'gallery' && <GalleryScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'manual' && <ManualScreen />}
        {toast && (
          <div className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}

function Sidebar(): React.JSX.Element {
  const screen = useApp((s) => s.screen)
  const goTo = useApp((s) => s.goTo)
  const info = useApp((s) => s.info)
  const shortcuts = useApp((s) => s.shortcuts)

  const fullscreenKey = shortcuts.find((s) => s.action === 'fullscreen')?.accelerator ?? 'F11'

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__mark">
          <Microscope size={19} strokeWidth={2.2} />
        </div>
        <div>
          <div className="sidebar__title">Microazz Cam</div>
          <div className="sidebar__subtitle">captura de imagens</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`navitem ${screen === id ? 'navitem--active' : ''}`}
            onClick={() => goTo(id)}
            aria-current={screen === id ? 'page' : undefined}
          >
            <Icon size={17} strokeWidth={2} />
            {label}
            {hint && <span className="navitem__hint">{hint}</span>}
          </button>
        ))}
      </nav>

      <UpdateNotice />

      <button
        type="button"
        className="navitem sidebar__full"
        onClick={() => void window.microazz.app.toggleFullscreen()}
        title="Mostra só a imagem do microscópio, ocupando o monitor inteiro"
      >
        <Maximize2 size={17} strokeWidth={2} />
        Imagem em tela cheia
        <span className="navitem__hint">{describeAccelerator(fullscreenKey)}</span>
      </button>

      <div className="sidebar__footer">versão {info?.appVersion ?? '—'}</div>
    </aside>
  )
}

/**
 * Aparece quando uma atualização já foi baixada. A instalação só acontece se o
 * usuário mandar — nunca no meio de um atendimento.
 */
function UpdateNotice(): React.JSX.Element | null {
  const [version, setVersion] = useState('')

  useEffect(() => window.microazz.app.onUpdateReady(setVersion), [])

  if (!version) return null

  return (
    <button
      type="button"
      className="updatenotice"
      onClick={() => void window.microazz.app.installUpdate()}
    >
      <Download size={15} />
      <span>
        Versão {version} pronta
        <small>Clique para reiniciar e atualizar</small>
      </span>
    </button>
  )
}
