# Microazz Cam

Captura de fotos e vídeos de câmeras de microscópio USB, com organização por
paciente/exame e envio automático para o Google Drive.

Companheiro de computador do aplicativo de celular **Microvision**
(`d:\projetos\microvision`, Expo/React Native), com o qual compartilha a
identidade visual, a regra de nomes de arquivo, o projeto do Google Cloud e a
pasta de destino no Drive.

---

## Como rodar

```bash
npm install       # uma vez
npm run dev       # abre o programa em modo desenvolvimento
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o programa; alterações no código aparecem na hora |
| `npm run typecheck` | Confere os tipos (roda antes de cada build) |
| `npm test` | Testes automatizados |
| `npm run build` | Compila sem gerar instalador |
| `npm run dist` | Gera o instalador em `release/<versão>/` |
| `npm run check:layout` | Percorre as telas e verifica rolagem, vazamento e tema |
| `npx electron scripts/check-google.mjs` | Confere se as credenciais entraram no build |
| `npx electron scripts/check-runtime.cjs` | Mostra versões e testa o SQLite embutido |

`check:layout` abre o app de verdade, entra em cada tela, enche as áreas roláveis
com 3000 px de conteúdo e confirma que elas **rolam em vez de esticar**. Foi essa
sonda que encontrou a grade da galeria encolhendo, o estado de tela cheia
chegando invertido e a imagem ocupando 17% da tela em vez de 100% — defeitos que
passariam por qualquer verificação de tipos.

---

## Credenciais do Google

As credenciais **não ficam no código-fonte**, porque o repositório é público:
uma chave do Google publicada num repositório público é encontrada por robôs em
minutos, e o próprio Google costuma revogá-la — o envio ao Drive pararia em
todos os clientes de uma vez.

Elas ficam em `google-oauth.json`, na raiz do projeto, que está no `.gitignore`.
O `electron.vite.config.ts` lê esse arquivo e embute os valores no `.exe` durante
o build. Estar dentro do `.exe` é inevitável e previsto: o Google documenta que,
em aplicativos para computador, a "chave secreta" não é um segredo de verdade —
quem protege a conta do usuário é o PKCE, que este programa usa.

**Numa máquina nova:** copie `google-oauth.example.json` para `google-oauth.json`,
preencha e rode o build. Sem o arquivo o programa funciona por completo; só o
envio ao Drive fica indisponível, com aviso na tela de Configurações.

Confira com `npx electron scripts/check-google.mjs` — ele mostra se as
credenciais entraram no build e se **não** vazaram para o código-fonte.

---

## Publicar uma versão nova

A atualização automática lê o GitHub Releases de
`github.com/youssefbrahim/microazz-cam`.

1. Suba o número da versão em `package.json`.
2. `npm run dist`
3. Publique o `.exe` gerado como *release* no GitHub, com a tag correspondente
   (ex.: `v1.0.1`).

Os programas já instalados verificam ao abrir e a cada 4 h, baixam em segundo
plano e avisam o usuário — que instala quando quiser, nunca no meio de um exame.

---

## Onde ficam as coisas

| O quê | Onde |
|---|---|
| Capturas do usuário | `Documentos\Microazz Cam\<Paciente>\<data + exame>\` |
| Banco, logs e token do Google | `%APPDATA%\microazz-cam\` |
| Cópia no Google Drive | `Microazz Cam\<Paciente>\<data + exame>\` |

Quem também usa o aplicativo de celular pode trocar a pasta do Drive para
**Microvision** em Configurações — aí as capturas do mesmo paciente ficam juntas
nas duas pontas.

---

## Decisões técnicas que valem conhecer

**Tema escuro em todas as telas.** Não é gosto: imagem de microscópio é avaliada
melhor sobre fundo escuro, porque uma tela clara ao redor força a pupila e altera
a percepção de contraste do que está sendo examinado. É o padrão do ramo (Zeiss
Labscope, ToupView) e combina com o consultório de luz baixa. A paleta inteira
sai dos tokens em `src/renderer/src/theme.css`.

**Altura limitada é o que faz a rolagem existir.** Todo contêiner entre a janela
e uma área rolável precisa de `min-height: 0` (flex) ou `minmax(0, 1fr)` (grid).
Sem isso a altura cresce com o conteúdo, o `overflow` nunca dispara e a tela não
rola. Confira com `npm run check:layout` depois de mexer em layout.

**Banco de dados sem módulo nativo.** Usa o `node:sqlite` que já vem no Node do
Electron. O `better-sqlite3` deixou de publicar binários prontos na v13 e
exigiria instalar o compilador da Microsoft em cada máquina — inaceitável para um
programa que precisa "só instalar e usar".

**Vídeo em MP4, gravado direto no disco.** O Chromium 150 grava H.264
nativamente, então o `ffmpeg` (~80 MB) ficou fora do instalador; o código testa o
suporte em tempo de execução e cai para WebM se um dia deixar de valer. Os
pedaços do vídeo vão para o arquivo a cada segundo — uma queda de energia perde
no máximo 1 s.

**A imagem passa por um canvas, não por CSS.** É o que garante que espelhamento,
rotação e ajustes que aparecem na tela sejam exatamente os que vão para o
arquivo. Sem nenhum ajuste ativo, a gravação usa o sinal original da câmera, que
é o caminho mais rápido e de melhor qualidade.

**Um canal só para as ações.** Botão, tecla, atalho global do Windows e pedal
desembocam todos em `emitAction` (`src/renderer/src/lib/actions.ts`), então é
impossível o pedal fazer algo ligeiramente diferente do botão.

**A nuvem é cópia, nunca o original.** Toda captura é gravada em disco primeiro e
só então entra na fila do Drive. A fila mora no banco: falta de luz no meio de um
envio de 2 GB não perde nada, e a retomada continua do byte onde parou.

---

## Estrutura

```
src/
├─ main/          processo principal (Node): janela, banco, arquivos, Drive, atalhos
│  ├─ db/         conexão, migrações e repositórios — única camada que conhece SQL
│  ├─ google/     login OAuth (PKCE + loopback) e envio ao Drive
│  └─ upload/     fila persistente com retentativa
├─ preload/       ponte segura entre a interface e o processo principal
├─ renderer/src/  interface React
│  ├─ lib/        câmera, captura, transformações, atalhos, pedal
│  ├─ components/ painel de ajustes, anotações, galeria, pedal
│  └─ screens/    Captura, Pacientes, Galeria, Configurações, Manual
└─ shared/        tipos e regras usados pelos dois lados (nomes, atalhos, pedal)
```

---

## Ambiente de desenvolvimento

Se o Electron abrir sem janela nenhuma, verifique a variável
`ELECTRON_RUN_AS_NODE`: com ela definida, o binário roda como Node puro.

```powershell
$env:ELECTRON_RUN_AS_NODE=''
npm run dev
```

Não edite arquivos-fonte com `Get-Content`/`Set-Content` do PowerShell 5.1: ele
lê UTF-8 como ANSI e corrompe toda a acentuação do arquivo.
