import { useCallback, useEffect, useState } from 'react'
import { FileWarning, FolderOpen, FolderSearch, ScrollText, TriangleAlert } from 'lucide-react'
import type { DiskSpace } from '@shared/types'
import { ShortcutSettings } from '../components/ShortcutSettings'
import { DriveSettings } from '../components/DriveSettings'
import { useApp } from '../store'

export function SettingsScreen(): React.JSX.Element {
  const info = useApp((s) => s.info)
  const notify = useApp((s) => s.notify)
  const load = useApp((s) => s.load)
  const [disk, setDisk] = useState<DiskSpace | null>(null)

  const refreshDisk = useCallback((): void => {
    window.microazz.storage
      .diskSpace()
      .then(setDisk)
      .catch(() => setDisk(null))
  }, [])

  useEffect(refreshDisk, [refreshDisk])

  const chooseFolder = useCallback(async (): Promise<void> => {
    const chosen = await window.microazz.storage.chooseMediaRoot()
    if (!chosen) return
    await load()
    refreshDisk()
    notify('Pasta das capturas alterada. Os arquivos antigos continuam onde estavam.')
  }, [load, notify, refreshDisk])

  // Pasta Documentos redirecionada para a nuvem: todo vídeo de exame começaria
  // a subir sozinho, consumindo internet e saindo do controle da clínica.
  const syncedToCloud = /[\\/](OneDrive|Google Drive|Dropbox|iCloudDrive)[\\/]/i.test(
    info?.mediaRoot ?? ''
  )

  return (
    <div className="screen screen--scroll">
      <div className="screen__inner">
        <h1 className="screen__title">Configurações</h1>
        <p className="screen__lead">
          Preferências do programa e informações para suporte técnico.
        </p>

        <div className="section-label">Arquivos</div>
        <div className="card">
          <dl className="kv">
            <dt>Pasta das capturas</dt>
            <dd>{info?.mediaRoot ?? '—'}</dd>
            <dt>Espaço livre no disco</dt>
            <dd>{disk ? `${formatBytes(disk.freeBytes)} de ${formatBytes(disk.totalBytes)}` : '—'}</dd>
          </dl>
          {syncedToCloud && (
            <div className="notice notice--warn">
              <TriangleAlert size={18} />
              <div>
                <strong>Esta pasta é sincronizada com a nuvem.</strong> Sua pasta Documentos está
                dentro do OneDrive, então cada vídeo de exame começaria a subir sozinho — gastando
                internet e colocando dado de paciente numa conta pessoal. Escolha uma pasta local,
                por exemplo <code>C:\Microazz Cam</code>. O envio ao Google Drive do próprio
                programa continua funcionando normalmente.
              </div>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn--primary" onClick={() => void chooseFolder()}>
              <FolderSearch size={16} /> Escolher outra pasta
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (info?.mediaRoot) void window.microazz.app.openPath(info.mediaRoot)
              }}
            >
              <FolderOpen size={16} /> Abrir pasta das capturas
            </button>
          </div>
        </div>

        <DriveSettings />

        <ShortcutSettings />

        <div className="section-label">Diagnóstico</div>
        <div className="card">
          <dl className="kv">
            <dt>Versão do Microazz Cam</dt>
            <dd>{info?.appVersion ?? '—'}</dd>
            <dt>Banco de dados</dt>
            <dd>
              {info?.sqlite ? (
                <span className="badge badge--ok">SQLite {info.sqlite} — funcionando</span>
              ) : (
                <span className="badge badge--err">indisponível</span>
              )}
            </dd>
            <dt>Motor de vídeo (Chromium)</dt>
            <dd>{info?.chromium ?? '—'}</dd>
            <dt>Electron / Node</dt>
            <dd>
              {info?.electron ?? '—'} / {info?.node ?? '—'}
            </dd>
            <dt>Dados do programa</dt>
            <dd>{info?.userDataPath ?? '—'}</dd>
          </dl>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                window.microazz.app
                  .diagnostics()
                  .then(() =>
                    notify('Relatório de diagnóstico criado na Área de Trabalho.')
                  )
                  .catch(() => notify('Não foi possível gerar o relatório.', 'error'))
              }}
            >
              <FileWarning size={16} /> Gerar relatório de diagnóstico
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                window.microazz.app
                  .openLogsFolder()
                  .catch(() => notify('Não foi possível abrir a pasta de registros.', 'error'))
              }}
            >
              <ScrollText size={16} /> Abrir pasta de registros
            </button>
          </div>
          <p className="hint" style={{ margin: '12px 0 0' }}>
            O relatório é um arquivo de texto para anexar num e-mail de suporte. Contém versões,
            pastas e as últimas mensagens do programa — <strong>nenhuma foto de paciente</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
