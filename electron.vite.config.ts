import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const dir = import.meta.dirname

/**
 * Credenciais do Google, lidas de `google-oauth.json` (fora do controle de
 * versão) e embutidas no programa durante o build.
 *
 * Elas precisam estar dentro do .exe para o login funcionar — o Google prevê
 * isso em aplicativos para computador, e quem protege a conta é o PKCE. O que
 * não pode é o valor ficar no código-fonte, porque o repositório é público.
 *
 * Sem o arquivo, o programa compila normalmente e apenas o envio ao Drive fica
 * indisponível, com aviso na própria tela de Configurações.
 */
function googleCredentials(): { clientId: string; clientSecret: string } {
  const file = resolve(dir, 'google-oauth.json')
  if (!existsSync(file)) return { clientId: '', clientSecret: '' }

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : ''
    }
  } catch {
    console.warn('[microazz-cam] google-oauth.json inválido; o envio ao Drive ficará desligado.')
    return { clientId: '', clientSecret: '' }
  }
}

const google = googleCredentials()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(dir, 'src/shared') }
    },
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(google.clientId),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify(google.clientSecret)
    },
    build: {
      rollupOptions: { input: { index: resolve(dir, 'src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(dir, 'src/shared') }
    },
    build: {
      rollupOptions: { input: { index: resolve(dir, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve(dir, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(dir, 'src/renderer/src'),
        '@shared': resolve(dir, 'src/shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve(dir, 'src/renderer/index.html') } }
    }
  }
})
