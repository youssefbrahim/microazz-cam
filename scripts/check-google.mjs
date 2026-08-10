/**
 * Confere se as credenciais do Google foram embutidas no build e se elas NÃO
 * estão no código-fonte (que vai para um repositório público).
 *
 *   npx electron-vite build && npx electron scripts/check-google.mjs
 */
import { app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const bundle = readFileSync(join(ROOT, 'out/main/index.js'), 'utf-8')
const fonte = readFileSync(join(ROOT, 'src/main/google/credentials.ts'), 'utf-8')

const local = existsSync(join(ROOT, 'google-oauth.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'google-oauth.json'), 'utf-8'))
  : { clientId: '', clientSecret: '' }

const mascara = (v) => (v ? `${v.slice(0, 12)}…${v.slice(-6)} (${v.length} caracteres)` : 'vazio')

console.log('\n===GOOGLE===')
console.log('arquivo local google-oauth.json :', local.clientId ? 'presente' : 'AUSENTE')
console.log('  clientId     :', mascara(local.clientId))
console.log('  clientSecret :', mascara(local.clientSecret))

console.log('\nembutido no build (out/main/index.js):')
console.log('  clientId     :', bundle.includes(local.clientId) && local.clientId ? 'SIM' : 'NÃO')
console.log(
  '  clientSecret :',
  bundle.includes(local.clientSecret) && local.clientSecret ? 'SIM' : 'NÃO'
)

console.log('\nvazando no código-fonte (credentials.ts):')
const vazaId = local.clientId && fonte.includes(local.clientId)
const vazaSecret = local.clientSecret && fonte.includes(local.clientSecret)
console.log('  clientId     :', vazaId ? 'VAZANDO — CORRIJA' : 'não (correto)')
console.log('  clientSecret :', vazaSecret ? 'VAZANDO — CORRIJA' : 'não (correto)')

console.log('\n.gitignore cobre google-oauth.json:',
  readFileSync(join(ROOT, '.gitignore'), 'utf-8').includes('google-oauth.json') ? 'SIM' : 'NÃO')

app.whenReady().then(async () => {
  await import(new URL('../out/main/index.js', import.meta.url).href).catch(() => undefined)
  console.log('===FIM===')
  app.exit(0)
})
