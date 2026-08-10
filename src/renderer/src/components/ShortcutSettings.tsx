import { useCallback, useEffect, useState } from 'react'
import { Footprints, Keyboard } from 'lucide-react'
import {
  DEFAULT_SHORTCUTS,
  describeAccelerator,
  eventToAccelerator,
  isValidAccelerator,
  SHORTCUT_LABELS,
  type ShortcutAction,
  type ShortcutBinding
} from '@shared/shortcuts'
import { describePedal, parsePedalConfig } from '@shared/pedal'
import { PedalWizard } from './PedalWizard'
import { useApp } from '../store'
import './ShortcutSettings.css'

/** Configuração dos atalhos de teclado e do pedal. */
export function ShortcutSettings(): React.JSX.Element {
  const shortcuts = useApp((s) => s.shortcuts)
  const reloadShortcuts = useApp((s) => s.reloadShortcuts)
  const notify = useApp((s) => s.notify)
  const pedalJson = useApp((s) => s.settings.pedalConfig)

  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const persist = useCallback(
    async (next: ShortcutBinding[]): Promise<void> => {
      const result = await window.microazz.shortcuts.write(next)
      await reloadShortcuts()
      if (result.failed.length > 0) {
        notify(
          `O Windows recusou ${result.failed.join(', ')} — outro programa já usa essa tecla. ` +
            'Escolha outra ou desligue o modo "em segundo plano".',
          'error'
        )
      }
    },
    [notify, reloadShortcuts]
  )

  // Captura a próxima tecla enquanto o usuário estiver gravando um atalho.
  useEffect(() => {
    if (!recording) return

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(null)
        return
      }

      const accelerator = eventToAccelerator(event)
      if (!accelerator || !isValidAccelerator(accelerator)) return

      const taken = shortcuts.find((s) => s.accelerator === accelerator && s.action !== recording)
      if (taken) {
        notify(`Essa tecla já está em "${SHORTCUT_LABELS[taken.action].label}".`, 'error')
        setRecording(null)
        return
      }

      void persist(
        shortcuts.map((s) => (s.action === recording ? { ...s, accelerator } : s))
      ).then(() => notify(`Atalho alterado para ${describeAccelerator(accelerator)}.`))
      setRecording(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [notify, persist, recording, shortcuts])

  const toggleGlobal = useCallback(
    (action: ShortcutAction, isGlobal: boolean): void => {
      void persist(shortcuts.map((s) => (s.action === action ? { ...s, isGlobal } : s)))
    },
    [persist, shortcuts]
  )

  const pedal = parsePedalConfig(pedalJson)

  return (
    <>
      <div className="section-label">Atalhos de teclado</div>
      <div className="card">
        <p className="hint">
          Clique na tecla ao lado da ação e aperte a tecla que quiser usar. Marque{' '}
          <strong>em segundo plano</strong> para o atalho funcionar mesmo com o Microazz Cam atrás de
          outra janela — útil se o prontuário eletrônico estiver por cima.
        </p>

        <table className="shortcuts">
          <thead>
            <tr>
              <th>Ação</th>
              <th>Tecla</th>
              <th>Em segundo plano</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((binding) => (
              <tr key={binding.action}>
                <td>
                  {SHORTCUT_LABELS[binding.action].label}
                  {SHORTCUT_LABELS[binding.action].hint && (
                    <small>{SHORTCUT_LABELS[binding.action].hint}</small>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={`keycap ${recording === binding.action ? 'keycap--rec' : ''}`}
                    onClick={() => setRecording(binding.action)}
                  >
                    {recording === binding.action
                      ? 'Aperte a tecla…'
                      : describeAccelerator(binding.accelerator)}
                  </button>
                </td>
                <td>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={binding.isGlobal}
                      onChange={(e) => toggleGlobal(binding.action, e.target.checked)}
                    />
                    <span />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void persist(DEFAULT_SHORTCUTS).then(() => notify('Atalhos restaurados.'))}
          >
            <Keyboard size={16} /> Voltar aos atalhos padrão
          </button>
        </div>
      </div>

      <div className="section-label">Pedal USB</div>
      <div className="card">
        <p className="hint">
          <strong>A maioria dos pedais funciona sem nada disso.</strong> Eles se apresentam ao
          Windows como um teclado e enviam uma tecla — nesse caso basta clicar na tecla da ação
          desejada acima e <em>pisar no pedal</em>: o programa aprende a tecla como se você tivesse
          apertado no teclado. Use o assistente abaixo só se pisar não fizer nada.
        </p>

        <div className="pedalstate">{describePedal(pedal)}</div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => setWizardOpen(true)}>
            <Footprints size={16} /> Assistente de pedal
          </button>
        </div>
      </div>

      {wizardOpen && <PedalWizard onClose={() => setWizardOpen(false)} />}
    </>
  )
}
