/**
 * Verificação de ambiente. Roda com `npm run check`.
 * Confirma a versão do Electron/Node/Chromium e se o SQLite embutido funciona,
 * que é o que decide se precisamos (ou não) de um módulo nativo compilado.
 */
const { app } = require('electron')

const out = []
out.push('electron   = ' + process.versions.electron)
out.push('node       = ' + process.versions.node)
out.push('chromium   = ' + process.versions.chrome)

try {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)')
  db.prepare('INSERT INTO t (nome) VALUES (?)').run('microvision')
  const row = db.prepare('SELECT nome FROM t WHERE id = 1').get()
  const version = db.prepare('SELECT sqlite_version() AS v').get()
  db.close()
  out.push('node:sqlite = OK (sqlite ' + version.v + ', leitura: ' + row.nome + ')')
} catch (e) {
  out.push('node:sqlite = FALHOU -> ' + e.message)
}

app.whenReady().then(() => {
  console.log('\n===RESULTADO===\n' + out.join('\n') + '\n===FIM===')
  app.quit()
})
