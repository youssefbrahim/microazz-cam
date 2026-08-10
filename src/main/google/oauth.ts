import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { shell, safeStorage } from 'electron'
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, hasGoogleCredentials } from './credentials.js'
import { userDataDir } from '../paths.js'
import { log } from '../log.js'

/**
 * Login com a conta Google, no fluxo que o Google recomenda para programas de
 * computador:
 *
 *  1. O programa abre um servidor num endereço local (127.0.0.1, porta sorteada).
 *  2. O navegador padrão abre a tela de login do Google.
 *  3. Depois de autorizar, o Google devolve um código para esse endereço local.
 *  4. O programa troca o código por um token de acesso e um de renovação.
 *
 * O token de renovação é guardado criptografado pelo cofre do próprio Windows
 * (DPAPI, via `safeStorage`), então só este usuário, neste computador, consegue
 * lê-lo. Com ele, o usuário faz login uma vez e não precisa repetir.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

const TOKEN_FILE = (): string => join(userDataDir(), 'google-token.bin')

interface StoredToken {
  refreshToken: string
  email: string
}

/** Token de acesso em memória — dura cerca de uma hora. */
let accessToken: { value: string; expiresAt: number } | null = null

// --- Guarda do token de renovação ---

function saveToken(token: StoredToken): void {
  const json = JSON.stringify(token)
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(TOKEN_FILE(), safeStorage.encryptString(json))
  } else {
    // Sem o cofre do sistema, preferimos não gravar credencial em texto puro.
    log.warn('cofre do sistema indisponível: o login precisará ser refeito ao reabrir o programa')
  }
}

function loadToken(): StoredToken | null {
  try {
    const file = TOKEN_FILE()
    if (!existsSync(file)) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    const json = safeStorage.decryptString(readFileSync(file))
    return JSON.parse(json) as StoredToken
  } catch (err) {
    log.warn('não foi possível ler o login salvo', err)
    return null
  }
}

function clearToken(): void {
  accessToken = null
  try {
    rmSync(TOKEN_FILE(), { force: true })
  } catch {
    // nada a fazer
  }
}

// --- PKCE ---

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// --- Página devolvida ao navegador ---

function resultPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${title}</title><style>
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f3f6fc;color:#0f172a;
display:grid;place-items:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid #e6ecf5;border-radius:20px;padding:40px 48px;
text-align:center;box-shadow:0 10px 30px rgba(15,23,42,.08);max-width:420px}
h1{font-size:20px;margin:0 0 8px;color:${ok ? '#2563eb' : '#b91c1c'}}
p{color:#64748b;font-size:14px;line-height:1.6;margin:0}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}

// --- Login ---

export interface GoogleAccount {
  connected: boolean
  email: string
  /** false quando as credenciais ainda não foram preenchidas no código. */
  configured: boolean
}

let pendingServer: Server | null = null

export async function signIn(): Promise<GoogleAccount> {
  if (!hasGoogleCredentials()) {
    throw new Error(
      'As credenciais do Google ainda não foram preenchidas. Veja as instruções em ' +
        'src/main/google/credentials.ts.'
    )
  }

  // Um login de cada vez.
  pendingServer?.close()
  pendingServer = null

  const { verifier, challenge } = createPkce()
  const state = base64url(randomBytes(16))

  // O endereço de retorno só é conhecido depois que o sistema sorteia a porta,
  // e o Google exige que a troca do código use exatamente o mesmo endereço.
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>(
    (resolve, reject) => {
    let redirectUri = ''

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('O login demorou demais e foi cancelado. Tente de novo.'))
    }, 180_000)

    const cleanup = (): void => {
      clearTimeout(timeout)
      server.close()
      if (pendingServer === server) pendingServer = null
    }

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1`)
      if (url.pathname !== '/') {
        response.writeHead(404).end()
        return
      }

      const error = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')
      const returnedCode = url.searchParams.get('code')

      const finish = (title: string, message: string, ok: boolean): void => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(resultPage(title, message, ok))
      }

      if (error) {
        finish('Acesso não autorizado', 'Você pode fechar esta aba e tentar de novo.', false)
        cleanup()
        reject(new Error('O acesso foi negado na tela do Google.'))
        return
      }

      // Protege contra uma resposta que não veio do pedido que fizemos.
      if (returnedState !== state || !returnedCode) {
        finish('Resposta inesperada', 'Feche esta aba e tente novamente pelo Microazz Cam.', false)
        cleanup()
        reject(new Error('A resposta do Google não corresponde ao pedido feito.'))
        return
      }

      finish(
        'Conta conectada',
        'Pode fechar esta aba e voltar ao Microazz Cam — o envio ao Drive já está ativo.',
        true
      )
      cleanup()
      resolve({ code: returnedCode, redirectUri })
    })

    server.on('error', (err) => {
      cleanup()
      reject(err)
    })

    // Porta 0 = o sistema escolhe uma livre.
    server.listen(0, '127.0.0.1', () => {
      pendingServer = server
      const address = server.address()
      if (!address || typeof address === 'string') {
        cleanup()
        reject(new Error('Não foi possível abrir o endereço local para o login.'))
        return
      }

      redirectUri = `http://127.0.0.1:${address.port}`
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: DRIVE_SCOPE,
        // Pede o token de renovação, para o usuário não ter que logar de novo.
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      })

      log.info('abrindo o navegador para o login do Google', { port: address.port })
      void shell.openExternal(`${AUTH_URL}?${params.toString()}`)
    })
    }
  )

  const tokens = await exchangeCode(code, verifier, redirectUri)
  const email = await fetchAccountEmail(tokens.access_token)

  accessToken = { value: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
  if (tokens.refresh_token) saveToken({ refreshToken: tokens.refresh_token, email })

  log.info('conta Google conectada', { email })
  return { connected: true, email, configured: true }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  })

  const data = (await response.json()) as TokenResponse & { error_description?: string }
  if (!response.ok) {
    throw new Error(`O Google recusou o login. ${data.error_description ?? response.status}`)
  }
  return data
}

/** Token válido para chamar a API do Drive, renovando quando necessário. */
export async function getAccessToken(): Promise<string> {
  // Uma folga de 60 s evita usar um token que expira no meio do envio.
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value

  const stored = loadToken()
  if (!stored) throw new Error('Nenhuma conta Google conectada.')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token'
    })
  })

  const data = (await response.json()) as TokenResponse & { error?: string }
  if (!response.ok) {
    // Token revogado ou expirado (o que acontece em 7 dias se a tela de
    // consentimento estiver "em teste"): o usuário precisa entrar de novo.
    if (data.error === 'invalid_grant') {
      clearToken()
      throw new Error(
        'A autorização do Google expirou. Conecte a conta novamente em Configurações.'
      )
    }
    throw new Error(`Não foi possível renovar o acesso ao Drive. ${data.error ?? response.status}`)
  }

  accessToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return accessToken.value
}

async function fetchAccountEmail(token: string): Promise<string> {
  try {
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!response.ok) return ''
    const data = (await response.json()) as { user?: { emailAddress?: string } }
    return data.user?.emailAddress ?? ''
  } catch {
    return ''
  }
}

export function accountStatus(): GoogleAccount {
  const stored = loadToken()
  return {
    connected: stored !== null,
    email: stored?.email ?? '',
    configured: hasGoogleCredentials()
  }
}

export async function signOut(): Promise<void> {
  const stored = loadToken()
  if (stored) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: stored.refreshToken })
      })
    } catch {
      // Mesmo se a revogação falhar, apagamos o token local.
    }
  }
  clearToken()
  log.info('conta Google desconectada')
}
