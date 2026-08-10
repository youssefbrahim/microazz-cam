/**
 * Retorno sonoro da captura.
 *
 * Quem usa pedal não está olhando para a tela nem para o botão — o som é a
 * confirmação de que a foto saiu. Geramos o clique por síntese, para não
 * carregar um arquivo de áudio no instalador.
 */

let context: AudioContext | null = null

function audioContext(): AudioContext {
  if (!context) context = new AudioContext()
  // O navegador suspende o áudio até a primeira interação do usuário.
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Clique curto e seco, parecido com o obturador de uma câmera. */
export function playShutter(): void {
  try {
    const ctx = audioContext()
    const now = ctx.currentTime

    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      // Ruído que decai rápido: dá a textura mecânica do obturador.
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
    }
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2600
    filter.Q.value = 1.1

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.28, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.06)
  } catch {
    // Sem áudio disponível o programa continua funcionando normalmente.
  }
}

/** Bipe grave ao iniciar e agudo ao encerrar a gravação. */
export function playRecordingTone(starting: boolean): void {
  try {
    const ctx = audioContext()
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = starting ? 660 : 440

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.2)
  } catch {
    // idem
  }
}
