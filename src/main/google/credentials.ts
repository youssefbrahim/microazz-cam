/**
 * Credenciais do Google.
 *
 * Os valores não ficam aqui: eles são lidos de `google-oauth.json` (na raiz do
 * projeto, fora do controle de versão) e embutidos durante o build, pelo
 * `electron.vite.config.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Por que não deixar a chave no código
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O repositório é público. Uma chave do Google publicada num repositório
 * público é encontrada por robôs de varredura em minutos, e o próprio Google
 * costuma revogá-la automaticamente — o envio ao Drive pararia de funcionar em
 * todos os clientes ao mesmo tempo.
 *
 * A chave precisa estar dentro do .exe para o login funcionar, e isso é
 * previsto: em aplicativos para computador o Google documenta que a "chave
 * secreta" não é um segredo de verdade. Quem protege a conta do usuário é o
 * PKCE, que este programa usa. O que não pode é o valor ficar no código-fonte
 * publicado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Como configurar numa máquina nova
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. Copie `google-oauth.example.json` para `google-oauth.json`.
 *   2. Preencha `clientId` e `clientSecret` com o que o Google Cloud mostrou em
 *      APIs e serviços → Credenciais → ID do cliente OAuth (tipo "Aplicativo
 *      para computador").
 *   3. Rode o build de novo.
 *
 * Sem esse arquivo o programa funciona por completo; só o envio ao Drive fica
 * indisponível, com aviso na tela de Configurações.
 */

declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string

export const GOOGLE_CLIENT_ID = __GOOGLE_CLIENT_ID__
export const GOOGLE_CLIENT_SECRET = __GOOGLE_CLIENT_SECRET__

/**
 * Escopo restrito: o programa só enxerga os arquivos que ele mesmo criou.
 * É o mesmo do aplicativo de celular, e é o que dispensa a auditoria de
 * segurança cara que o Google exige para acesso amplo ao Drive.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function hasGoogleCredentials(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0 && GOOGLE_CLIENT_SECRET.trim().length > 0
}
