import { useCallback, useEffect, useState } from 'react'
import { CloudOff, CloudUpload, LogOut, RefreshCw, TriangleAlert } from 'lucide-react'
import type { UploadStatus } from '@shared/types'
import { useApp } from '../store'

/** Conexão com o Google Drive e situação da fila de envio. */
export function DriveSettings(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const notify = useApp((s) => s.notify)

  const [status, setStatus] = useState<UploadStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.microazz.drive.status().then(setStatus)
    return window.microazz.drive.onStatus(setStatus)
  }, [])

  const connect = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await window.microazz.drive.signIn())
      notify('Conta Google conectada. As próximas capturas sobem sozinhas.')
    } catch (err) {
      notify(cleanError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [notify])

  const disconnect = useCallback(async (): Promise<void> => {
    setStatus(await window.microazz.drive.signOut())
    notify('Conta desconectada. O programa continua gravando tudo no computador.')
  }, [notify])

  return (
    <>
      <div className="section-label">Google Drive</div>
      <div className="card">
        {status && !status.configured ? (
          <div className="notice notice--warn">
            <TriangleAlert size={18} />
            <div>
              <strong>As credenciais do Google ainda não foram preenchidas.</strong> O envio ao
              Drive fica indisponível até isso ser feito — todo o resto do programa funciona
              normalmente. As instruções passo a passo estão no arquivo{' '}
              <code>src/main/google/credentials.ts</code>.
            </div>
          </div>
        ) : (
          <>
            <p className="hint">
              O envio ao Drive é uma <strong>cópia adicional</strong>. Tudo é gravado primeiro no
              computador, e a nuvem recebe depois — se a internet cair, nada se perde e o envio
              continua sozinho quando ela voltar.
            </p>

            <dl className="kv">
              <dt>Conta conectada</dt>
              <dd>
                {status?.connected ? (
                  <span className="badge badge--ok">{status.email || 'conectada'}</span>
                ) : (
                  <span className="badge badge--err">nenhuma</span>
                )}
              </dd>
              <dt>Fila de envio</dt>
              <dd>
                {status
                  ? `${status.pending} na fila · ${status.done} enviado(s) · ${status.failed} com erro`
                  : '—'}
              </dd>
              <dt>Pasta no Drive</dt>
              <dd>
                {settings.driveFolderName || 'Microazz Cam'} / &lt;paciente&gt; / &lt;exame&gt;
              </dd>
            </dl>

            <div className="formgrid" style={{ marginTop: 16 }}>
              <label>
                Nome da pasta base no Drive
                <input
                  value={settings.driveFolderName}
                  onChange={(e) => void updateSettings({ driveFolderName: e.target.value })}
                />
              </label>
              <label style={{ justifyContent: 'flex-end' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.driveAutoUpload}
                      onChange={(e) => void updateSettings({ driveAutoUpload: e.target.checked })}
                    />
                    <span />
                  </label>
                  Enviar automaticamente cada captura
                </span>
              </label>
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              {status?.connected ? (
                <>
                  <button type="button" className="btn" onClick={() => void disconnect()}>
                    <LogOut size={16} /> Desconectar
                  </button>
                  {status.failed > 0 && (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => {
                        void window.microazz.drive.retryFailed().then(setStatus)
                      }}
                    >
                      <RefreshCw size={16} /> Reenviar {status.failed} com erro
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void connect()}
                  disabled={busy}
                >
                  <CloudUpload size={16} />
                  {busy ? 'Aguardando o navegador…' : 'Conectar conta Google'}
                </button>
              )}
            </div>

            {busy && (
              <p className="hint" style={{ margin: '12px 0 0' }}>
                Uma aba abriu no seu navegador. Entre com a conta Google da clínica e autorize o
                acesso. Depois é só voltar para cá.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Selo compacto para a barra da captura. */
export function DriveBadge(): React.JSX.Element | null {
  const [status, setStatus] = useState<UploadStatus | null>(null)

  useEffect(() => {
    void window.microazz.drive.status().then(setStatus)
    return window.microazz.drive.onStatus(setStatus)
  }, [])

  if (!status?.configured) return null

  if (!status.connected) {
    return (
      <span className="drivebadge drivebadge--off" title="Nenhuma conta Google conectada">
        <CloudOff size={13} /> local
      </span>
    )
  }

  if (status.failed > 0) {
    return (
      <span className="drivebadge drivebadge--err" title="Envios com erro — veja em Configurações">
        <TriangleAlert size={13} /> {status.failed}
      </span>
    )
  }

  if (status.pending > 0) {
    return (
      <span className="drivebadge drivebadge--busy" title="Enviando ao Google Drive">
        <CloudUpload size={13} /> {status.pending}
      </span>
    )
  }

  return (
    <span className="drivebadge drivebadge--ok" title="Tudo enviado ao Google Drive">
      <CloudUpload size={13} /> em dia
    </span>
  )
}

function cleanError(err: unknown): string {
  return String(err)
    .replace(/^Error:\s*/i, '')
    .replace(/^.*Error invoking remote method '[^']*':\s*(Error:\s*)?/i, '')
}
