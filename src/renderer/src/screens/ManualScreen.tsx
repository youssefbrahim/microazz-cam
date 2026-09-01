import { describeAccelerator, SHORTCUT_LABELS } from '@shared/shortcuts'
import { useApp } from '../store'

/** O essencial para usar o Microazz Cam no dia a dia do consultório. */
export function ManualScreen(): React.JSX.Element {
  const shortcuts = useApp((s) => s.shortcuts)
  const info = useApp((s) => s.info)

  return (
    <div className="screen screen--scroll">
      <div className="screen__inner">
        <h1 className="screen__title">Manual</h1>
        <p className="screen__lead">
          Microazz Cam {info?.appVersion ?? ''} — captura de imagens de microscópio.
        </p>

        <div className="section-label">Atalhos</div>
        <div className="card">
          <table className="shortcuts">
            <tbody>
              {shortcuts.map((binding) => (
                <tr key={binding.action}>
                  <td>{SHORTCUT_LABELS[binding.action].label}</td>
                  <td>
                    <span className="keycap" style={{ display: 'inline-block' }}>
                      {describeAccelerator(binding.accelerator)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                    {binding.isGlobal ? 'funciona em segundo plano' : 'com a janela em foco'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ margin: '14px 0 0' }}>
            Todos podem ser trocados em <strong>Configurações → Atalhos de teclado</strong>.
          </p>
        </div>

        <div className="section-label">Painel de capturas</div>
        <div className="card">
          <p style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            No rodapé da tela de captura fica tudo o que já foi capturado{' '}
            <strong>neste exame</strong>, com a contagem de fotos e vídeos. Ele tem dois formatos,
            no canto direito: <strong>Tira</strong>, uma faixa que ocupa pouco espaço, e{' '}
            <strong>Grade</strong>, a visão geral para conferir o conjunto antes de encerrar o
            atendimento. Clicando em <strong>Capturas</strong> o painel fecha e a imagem do
            microscópio ganha o espaço; ele reabre no mesmo formato da próxima vez.
          </p>
          <p
            style={{ marginBottom: 0, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65 }}
          >
            Clique numa foto para ampliar com zoom; passe o mouse por cima da miniatura para{' '}
            <strong>anotar</strong>, <strong>mostrar no Explorer</strong> ou{' '}
            <strong>mandar para a Lixeira</strong>. A nuvem no canto indica o envio ao Google Drive.
            Ao trocar de paciente, o painel se esvazia — as capturas do anterior não ficam à vista
            de quem entrar na sala.
          </p>
        </div>

        <div className="section-label">Imagem em tela cheia</div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            O botão <strong>Imagem em tela cheia</strong>, no rodapé do menu, deixa só a imagem do
            microscópio ocupando o monitor inteiro — sem menu, sem botões, sem capturas. Os
            controles de foto, vídeo e congelar flutuam sobre a imagem e{' '}
            <strong>somem sozinhos</strong> depois de três segundos parados, junto com o cursor;
            basta mexer o mouse para trazê-los de volta. Os atalhos de teclado e o pedal continuam
            funcionando normalmente. Para sair: a mesma tecla, <strong>Esc</strong>, ou o botão
            &ldquo;Sair&rdquo; na barra flutuante.
          </p>
        </div>

        <div className="section-label">A câmera do microscópio não aparece</div>
        <div className="card">
          <p style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            Na grande maioria das vezes é a permissão do Windows, não o programa. Abra{' '}
            <strong>Iniciar → Configurações → Privacidade e segurança → Câmera</strong> e ligue a
            opção{' '}
            <strong>“Permitir que aplicativos da área de trabalho acessem sua câmera”</strong>.
            Depois feche e abra o Microazz Cam.
          </p>
          <p style={{ marginBottom: 0, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
            Se a mensagem for <em>“a câmera está sendo usada por outro programa”</em>, feche o
            software que veio com o microscópio, o Teams, o Zoom ou o aplicativo Câmera do Windows.
            Uma câmera só atende um programa por vez. Para gravar vídeo com narração, repita a
            liberação na seção <strong>Microfone</strong>.
          </p>
        </div>

        <div className="section-label">Pedal</div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            A maioria dos pedais USB se apresenta ao Windows como um teclado. Para usá-lo, vá em{' '}
            <strong>Configurações → Atalhos</strong>, clique na tecla da ação desejada (por exemplo{' '}
            <em>Tirar foto</em>) e <strong>pise no pedal</strong> — o programa aprende a tecla que
            ele envia. Marque também <strong>“em segundo plano”</strong> para o pedal funcionar com
            o prontuário eletrônico aberto por cima. Se pisar não produzir nada, use o{' '}
            <strong>Assistente de pedal</strong> na mesma tela.
          </p>
        </div>

        <div className="section-label">Onde ficam os arquivos</div>
        <div className="card">
          <p style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            Tudo é gravado primeiro no computador, em uma pasta por paciente e outra por exame:
          </p>
          <p
            style={{
              margin: '0 0 12px',
              padding: '10px 14px',
              background: 'var(--field)',
              borderRadius: 10,
              fontSize: 12.5,
              overflowWrap: 'anywhere'
            }}
          >
            {info?.mediaRoot ?? 'Documentos\\Microazz Cam'}\&lt;Paciente&gt;\&lt;data + exame&gt;\
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
            O envio ao Google Drive é uma <strong>cópia adicional</strong>. Se a internet cair, a
            captura não para: os arquivos ficam na fila e sobem sozinhos quando a conexão voltar.
          </p>
        </div>

        <div className="section-label">Deu algum problema</div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65 }}>
            Em <strong>Configurações → Diagnóstico</strong>, clique em{' '}
            <strong>Gerar relatório de diagnóstico</strong>. Um arquivo de texto é criado na Área de
            Trabalho — anexe num e-mail para o suporte. Ele contém versões, pastas e as últimas
            mensagens do programa; <strong>nenhuma foto de paciente vai junto</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
