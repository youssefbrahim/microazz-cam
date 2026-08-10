/**
 * Sonda de layout. Roda com:
 *   npx electron-vite build && npx electron scripts/check-layout.mjs
 *
 * Carrega o app de verdade (com todos os canais registrados), percorre as
 * telas e mede se as áreas de rolagem estão limitadas pela janela e se sobrou
 * alguma superfície clara no tema.
 */
import { app, BrowserWindow } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = process.cwd()

// Importar o bundle já executa o app: janela, banco, canais, tudo.
await import(pathToFileURL(join(ROOT, 'out/main/index.js')).href)

const SCREENS = [
  ['capture', 'Captura'],
  ['patients', 'Pacientes'],
  ['gallery', 'Galeria'],
  ['settings', 'Configurações'],
  ['manual', 'Manual']
]

const PROBE = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const screens = ${JSON.stringify(SCREENS)}
  const results = []

  for (const [id, label] of screens) {
    const btn = [...document.querySelectorAll('.navitem')].find((b) => b.textContent.includes(label))
    if (btn) btn.click()
    await sleep(500)

    const main = document.querySelector('.main')
    if (!main) { results.push({ id, erro: 'sem .main' }); continue }

    const scrollable = []
    for (const el of main.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (['auto', 'scroll'].includes(cs.overflowY) && el.clientHeight > 0) {
        scrollable.push({
          cls: String(el.className).split(' ')[0].slice(0, 26),
          h: Math.round(el.clientHeight),
          sh: Math.round(el.scrollHeight)
        })
      }
    }

    // Áreas hoje vazias parecem "cabe" só porque não há conteúdo. Enchemos
    // cada uma com um bloco alto para provar que ela rola em vez de esticar a
    // janela — que era exatamente o defeito relatado.
    const stress = []
    for (const el of main.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (!['auto', 'scroll'].includes(cs.overflowY) || el.clientHeight === 0) continue
      // Campos de texto também rolam sozinhos, mas não aceitam um filho.
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(el.tagName)) continue

      const filler = document.createElement('div')
      filler.style.height = '3000px'
      filler.dataset.sonda = '1'
      el.appendChild(filler)

      const alturaAntes = el.clientHeight
      el.scrollTop = 99999
      stress.push({
        cls: String(el.className).split(' ')[0].slice(0, 26),
        alturaVisivel: Math.round(el.clientHeight),
        cresceu: el.clientHeight > alturaAntes,
        rolou: Math.round(el.scrollTop) > 0
      })
      el.scrollTop = 0
      filler.remove()
    }

    const limit = main.getBoundingClientRect().bottom
    const overflowing = []
    for (const el of main.children) {
      const r = el.getBoundingClientRect()
      if (r.bottom > limit + 2) {
        overflowing.push({ cls: String(el.className).slice(0, 30), bottom: Math.round(r.bottom), limit: Math.round(limit) })
      }
    }

    results.push({ id, scrollable, overflowing, stress })
  }

  const light = []
  for (const el of document.querySelectorAll('.app *')) {
    const cs = getComputedStyle(el)
    const m = cs.backgroundColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/)
    if (!m) continue
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (a < 0.5) continue
    const luma = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255
    if (luma > 0.55) light.push(String(el.className).split(' ')[0].slice(0, 30) + ' = ' + cs.backgroundColor)
  }

  return { results, light: [...new Set(light)].slice(0, 15), bodyBg: getComputedStyle(document.body).backgroundColor }
})()
`

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 3500))

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.log('ERRO: nenhuma janela encontrada')
    app.exit(1)
    return
  }

  try {
    const out = await win.webContents.executeJavaScript(PROBE)

    console.log('\n===LAYOUT===')
    console.log('fundo do body:', out.bodyBg)

    for (const r of out.results) {
      console.log(`\n--- ${r.id} ---`)
      if (r.erro) {
        console.log('  ', r.erro)
        continue
      }
      console.log('  vaza para fora da janela:', r.overflowing.length ? JSON.stringify(r.overflowing) : 'nada')
      if (!r.scrollable.length) console.log('   (nenhuma área rolável)')
      for (const s of r.stress) {
        const veredito = s.cresceu ? 'FALHA: esticou' : s.rolou ? 'OK: rolou' : 'FALHA: não rolou'
        console.log(`   [${veredito}] ${s.cls} — visível ${s.alturaVisivel}px com 3000px dentro`)
      }
    }

    console.log('\n--- superfícies claras restantes ---')
    console.log(out.light.length ? out.light.join('\n') : 'nenhuma')

    // --- Tela cheia da imagem ---
    const ESTADO = `
      (() => {
        const canvas = document.querySelector('.stage__canvas')
        const r = canvas ? canvas.getBoundingClientRect() : null
        const visivel = (sel) => !!document.querySelector(sel)?.offsetParent
        return {
          classeApp: document.querySelector('.app').className.trim(),
          barraLateral: visivel('.sidebar'),
          barraSuperior: visivel('.capture__top'),
          controles: visivel('.controls'),
          miniaturas: visivel('.strip'),
          painelAjustes: visivel('.panel'),
          controlesFlutuantes: !!document.querySelector('.cine__bar'),
          imagem: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
          palco: (() => { const s = document.querySelector('.stage'); return s ? { w: s.clientWidth, h: s.clientHeight } : null })(),
          janela: { w: window.innerWidth, h: window.innerHeight },
          areaMain: (() => { const m = document.querySelector('.main').getBoundingClientRect(); return { w: Math.round(m.width), h: Math.round(m.height) } })()
        }
      })()
    `

    console.log('\n--- tela cheia da imagem ---')
    win.setFullScreen(true)
    await new Promise((r) => setTimeout(r, 1400))
    const ligada = await win.webContents.executeJavaScript(ESTADO)
    console.log('  LIGADA   :', JSON.stringify(ligada))
    if (ligada.imagem && ligada.janela) {
      const cobertura = Math.round(
        (Math.max(ligada.imagem.w / ligada.janela.w, ligada.imagem.h / ligada.janela.h)) * 100
      )
      console.log(`  a imagem preenche ${cobertura}% da maior dimensão da janela`)
    }

    win.setFullScreen(false)
    await new Promise((r) => setTimeout(r, 1400))
    console.log('  DESLIGADA:', JSON.stringify(await win.webContents.executeJavaScript(ESTADO)))

    console.log('===FIM===')
  } catch (err) {
    console.log('ERRO NA SONDA:', err.message)
  }

  app.exit(0)
})
