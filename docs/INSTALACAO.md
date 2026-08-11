# Microazz Cam — Guia de instalação

Para o computador do consultório. Leva uns 5 minutos.

---

## 1. Baixar

Abra o endereço abaixo e clique no arquivo **Microazz-Cam-Setup-1.0.0.exe**:

**https://github.com/youssefbrahim/microazz-cam/releases/latest**

O download tem cerca de 96 MB.

---

## 2. Instalar

Clique duas vezes no arquivo baixado.

### O Windows vai mostrar uma tela azul de aviso

Isso é esperado e **não significa que o programa tem vírus**. O Windows exibe
esse aviso para todo programa novo que ainda não foi instalado por muita gente.

Na tela azul:

1. Clique em **Mais informações** (o link pequeno, embaixo do texto)
2. Clique no botão **Executar assim mesmo**

Depois é só seguir o instalador: **Avançar** → **Instalar** → **Concluir**.

O atalho **Microazz Cam** aparece na área de trabalho.

---

## 3. Liberar a câmera no Windows

**Este passo é obrigatório.** Sem ele o programa abre, mas não mostra imagem
nenhuma.

1. Aperte a tecla **Windows** e digite `câmera`
2. Abra **Configurações de privacidade da câmera**
3. Ligue a chave **Acesso à câmera**
4. Role a página até o fim e ligue também
   **Permitir que aplicativos da área de trabalho acessem sua câmera**

Se for gravar vídeo com narração, repita o mesmo na seção **Microfone**.

---

## 4. Conectar o microscópio

Ligue o cabo USB da câmera do microscópio **antes** de abrir o programa.

Abra o **Microazz Cam**. A imagem deve aparecer em alguns segundos, e o nome da
câmera aparece na lista no alto da tela.

### Se a imagem não aparecer

| O que diz na tela | O que fazer |
|---|---|
| "O Windows está bloqueando o acesso à câmera" | Refaça o passo 3 e reabra o programa |
| "A câmera está sendo usada por outro programa" | Feche o software que veio com o microscópio, o Teams, o Zoom ou o app Câmera do Windows. Uma câmera atende um programa por vez |
| "Nenhuma câmera foi encontrada" | Verifique o cabo USB. Tente outra porta, de preferência atrás do computador |

---

## 5. Primeiros ajustes

**A imagem do microscópio costuma vir invertida.** Use os botões de espelhar e
girar, no canto direito da barra inferior, até a imagem ficar na posição certa.
O programa memoriza o ajuste por câmera — só precisa fazer uma vez.

No painel da direita ficam brilho, contraste e os controles que a sua câmera
oferecer. Depois de acertar para uma objetiva, salve com um nome
(ex.: `Objetiva 40x`) e troque num clique depois.

---

## 6. Conectar o Google Drive (opcional)

Serve para ter uma cópia das capturas na nuvem. **O programa funciona sem
internet** — a nuvem é uma cópia adicional, nunca o original.

1. Vá em **Configurações** → **Conectar conta Google**
2. O navegador abre; entre com a conta da clínica e clique em **Permitir**
3. Volte ao programa

A partir daí cada foto e vídeo sobe sozinho. Se a internet cair, os arquivos
ficam na fila e sobem quando ela voltar — nada se perde.

---

## Usando no dia a dia

| Tecla | O que faz |
|---|---|
| **Espaço** | Tira foto |
| **F2** | Inicia / para a gravação de vídeo |
| **F3** | Congela a imagem para analisar sem mexer no microscópio |
| **F4** | Troca de paciente ou abre um novo exame |
| **F11** | Imagem em tela cheia |

Todas podem ser trocadas em **Configurações → Atalhos de teclado**.

### Pedal

A maioria dos pedais USB funciona como um teclado. Para configurar: vá em
**Configurações → Atalhos**, clique na tecla ao lado de *Tirar foto* e
**pise no pedal**. Pronto.

Marque também **"em segundo plano"** se quiser que o pedal funcione com o
prontuário eletrônico aberto por cima.

---

## Onde ficam as fotos e os vídeos

```
Documentos\Microazz Cam\<Nome do paciente>\<data + exame>\
```

Uma pasta por paciente, uma subpasta por exame. Pode abrir pelo Explorer a
qualquer momento — são arquivos JPG e MP4 comuns.

> **Atenção:** se a pasta Documentos do computador estiver sincronizada com
> OneDrive, o programa avisa e sugere trocar a pasta. Vale trocar para
> `C:\Microazz Cam` — vídeos de exame subindo sozinhos para uma conta pessoal
> gastam internet e tiram o dado do controle da clínica.

---

## Deu problema

Em **Configurações → Diagnóstico**, clique em **Gerar relatório de
diagnóstico**. Um arquivo de texto aparece na Área de Trabalho — envie por
e-mail para o suporte.

O arquivo traz versões, pastas e as últimas mensagens do programa.
**Nenhuma foto de paciente vai junto.**

---

## Atualizações

O programa verifica sozinho e avisa quando houver versão nova. A instalação só
acontece quando você mandar — nunca no meio de um atendimento.
