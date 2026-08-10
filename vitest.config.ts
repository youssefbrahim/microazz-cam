import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Testes automatizados cobrem só o que dá para verificar sem hardware:
 * nomes de arquivo e pasta, montagem de caminhos e regras de fila. Câmera,
 * pedal e Drive são verificados manualmente com o equipamento real.
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'src/shared') }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // O gerador de laudo roda no navegador, mas só usa APIs que o Node também
    // tem (fetch, TextDecoder, atob), então não precisa de um DOM simulado.
    globals: false
  }
})
