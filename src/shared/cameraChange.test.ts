import { describe, expect, it } from 'vitest'
import { decideCameraChange, type CameraChangeInput, type CameraChoice } from './cameraChange'

const cam = (deviceId: string, label: string): CameraChoice => ({ deviceId, label })

const EMBUTIDA = cam('id-webcam', 'Integrated Camera')
const MICROSCOPIO = cam('id-4k', '4K Camera')
const OUTRO = cam('id-h1600', 'H1600 Cam')

/** Cenário base: parado, com o microscópio de sempre salvo nas preferências. */
function scene(over: Partial<CameraChangeInput> = {}): CameraChangeInput {
  return {
    status: 'disconnected',
    available: [EMBUTIDA],
    arrived: [],
    current: null,
    savedDeviceId: MICROSCOPIO.deviceId,
    savedLabel: MICROSCOPIO.label,
    ...over
  }
}

describe('com a imagem no ar', () => {
  const live = (over: Partial<CameraChangeInput> = {}): CameraChangeInput =>
    scene({ status: 'live', current: MICROSCOPIO, available: [EMBUTIDA, MICROSCOPIO], ...over })

  it('não mexe enquanto a câmera continua na lista', () => {
    expect(decideCameraChange(live())).toEqual({ kind: 'ignore' })
  })

  it('avisa quando a câmera aberta some', () => {
    expect(decideCameraChange(live({ available: [EMBUTIDA] }))).toEqual({ kind: 'lost' })
  })

  it('reconhece a câmera pelo nome quando o identificador mudou', () => {
    const remendada = cam('id-novo', MICROSCOPIO.label)
    expect(decideCameraChange(live({ available: [EMBUTIDA, remendada] }))).toEqual({
      kind: 'ignore'
    })
  })

  it('não troca de câmera no meio do exame, mesmo com outra chegando', () => {
    const acao = decideCameraChange(
      live({ available: [EMBUTIDA, MICROSCOPIO, OUTRO], arrived: [OUTRO] })
    )
    expect(acao).toEqual({ kind: 'ignore' })
  })
})

describe('com o programa parado', () => {
  it('reabre quando a câmera de sempre volta', () => {
    const acao = decideCameraChange(scene({ available: [EMBUTIDA, MICROSCOPIO] }))
    expect(acao).toEqual({ kind: 'reopen' })
  })

  it('reabre reconhecendo pelo nome, com identificador novo', () => {
    const remendada = cam('id-outro', MICROSCOPIO.label)
    const acao = decideCameraChange(
      scene({ available: [EMBUTIDA, remendada], arrived: [remendada] })
    )
    expect(acao).toEqual({ kind: 'reopen' })
  })

  // O bug que motivou este módulo: trocar de microscópio deixava o programa
  // parado, porque o nome da câmera nova não batia com o da anterior.
  it('abre a câmera nova quando é diferente da de costume', () => {
    const acao = decideCameraChange(scene({ available: [EMBUTIDA, OUTRO], arrived: [OUTRO] }))
    expect(acao).toEqual({ kind: 'open', deviceId: OUTRO.deviceId })
  })

  it('nunca abre a webcam embutida por conta própria', () => {
    // Ela está na lista, mas não é novidade: já estava aqui antes.
    expect(decideCameraChange(scene())).toEqual({ kind: 'ignore' })
  })

  it('abre o que houver na primeira execução, sem nada salvo', () => {
    const acao = decideCameraChange(scene({ savedDeviceId: '', savedLabel: '' }))
    expect(acao).toEqual({ kind: 'reopen' })
  })

  it('não faz nada quando não há câmera nenhuma', () => {
    const acao = decideCameraChange(scene({ available: [], savedDeviceId: '', savedLabel: '' }))
    expect(acao).toEqual({ kind: 'ignore' })
  })

  it('prefere a câmera de sempre quando as duas estão presentes', () => {
    const acao = decideCameraChange(
      scene({ available: [EMBUTIDA, MICROSCOPIO, OUTRO], arrived: [OUTRO] })
    )
    expect(acao).toEqual({ kind: 'reopen' })
  })
})
