/**
 * Verifica o caminho do login do Google até a porta da tela de consentimento —
 * tudo o que não depende de um humano clicar em "Permitir".
 *
 *   npx electron-vite build && npx electron scripts/check-drive.mjs
 *
 * Em vez de abrir o navegador, captura o endereço que seria aberto e confere
 * cada parâmetro. Depois testa se o servidor local que recebe a resposta do
 * Google está mesmo escutando.
 */
import { app, BrowserWindow, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { get } from 'node:http'

const ROOT = process.cwd()

// Precisa acontecer antes de o app carregar: assim ele chama a nossa versão.
let authUrl = ''
shell.openExternal = async (url) => {
  authUrl = url
}

await import(pathToFileURL(join(ROOT, 'out/main/index.js')).href)

const ok = (b) => (b ? 'OK' : 'FALHA')

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 3000))
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.log('ERRO: janela não abriu')
    app.exit(1)
    return
  }

  console.log('\n===GOOGLE DRIVE===')

  const status = await win.webContents.executeJavaScript('window.microazz.drive.status()')
  console.log('credenciais embutidas :', ok(status.configured))
  console.log('conta já conectada    :', status.connected ? status.email || 'sim' : 'não')

  if (!status.configured) {
    console.log('\nSem credenciais não há o que testar.')
    console.log('===FIM===')
    app.exit(0)
    return
  }

  // Dispara o login. A promessa fica pendente esperando o Google — não a
  // aguardamos; o que interessa é o endereço que ele tentaria abrir.
  void win.webContents.executeJavaScript('window.microazz.drive.signIn()').catch(() => undefined)
  await new Promise((r) => setTimeout(r, 2500))

  if (!authUrl) {
    console.log('\nFALHA: o programa não tentou abrir o navegador.')
    console.log('===FIM===')
    app.exit(1)
    return
  }

  const url = new URL(authUrl)
  const p = url.searchParams
  const redirect = p.get('redirect_uri') ?? ''

  console.log('\n--- endereço da tela de consentimento ---')
  console.log('  destino          :', `${url.origin}${url.pathname}`, ok(url.host === 'accounts.google.com'))
  console.log('  client_id        :', ok((p.get('client_id') ?? '').endsWith('.apps.googleusercontent.com')))
  console.log('  escopo           :', p.get('scope'), ok(p.get('scope') === 'https://www.googleapis.com/auth/drive.file'))
  console.log('  access_type      :', p.get('access_type'), ok(p.get('access_type') === 'offline'))
  console.log('  prompt           :', p.get('prompt'), ok(p.get('prompt') === 'consent'))
  console.log('  PKCE (método)    :', p.get('code_challenge_method'), ok(p.get('code_challenge_method') === 'S256'))
  console.log('  PKCE (desafio)   :', ok((p.get('code_challenge') ?? '').length >= 43))
  console.log('  state anti-fraude:', ok((p.get('state') ?? '').length >= 16))
  console.log('  retorno local    :', redirect, ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(redirect)))

  // O servidor local precisa estar de pé para receber a resposta do Google.
  const alive = await new Promise((resolve) => {
    const req = get(`${redirect}/?error=teste_da_sonda`, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(3000, () => {
      req.destroy()
      resolve(false)
    })
  })
  console.log('  servidor local responde:', ok(alive))

  console.log('\n===FIM===')
  app.exit(0)
})
