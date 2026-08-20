/**
 * Decide o que fazer quando o Windows avisa que a lista de câmeras mudou.
 *
 * Fica fora do React porque é a parte que erra calada: abrir a câmera errada,
 * ou não abrir nenhuma, chega no usuário como um genérico "não reconhece". Aqui
 * a regra fica visível e testável.
 *
 * Duas garantias que o programa precisa manter, e que os testes prendem:
 * com a imagem no ar nunca trocamos de câmera sozinhos, e a webcam embutida
 * nunca é aberta por conta própria — ela não conta como novidade, porque já
 * estava na lista desde o começo.
 */

export type CameraStatus = 'starting' | 'live' | 'disconnected' | 'error'

/** O mínimo que precisamos saber de uma câmera para decidir. */
export interface CameraChoice {
  deviceId: string
  label: string
}

export type CameraChangeAction =
  /** Nada a fazer. */
  | { kind: 'ignore' }
  /** A câmera que estava no ar sumiu. */
  | { kind: 'lost' }
  /** Reabre seguindo a preferência salva. */
  | { kind: 'reopen' }
  /** Abre esta câmera especificamente, sem passar pela preferência salva. */
  | { kind: 'open'; deviceId: string }

export interface CameraChangeInput {
  status: CameraStatus
  /** Todas as câmeras que o sistema lista agora. */
  available: CameraChoice[]
  /** Só as que apareceram desde a leitura anterior. */
  arrived: CameraChoice[]
  /** A que está aberta no momento, se houver. */
  current: CameraChoice | null
  savedDeviceId: string
  savedLabel: string
}

export function decideCameraChange(input: CameraChangeInput): CameraChangeAction {
  const { status, available, arrived, current, savedDeviceId, savedLabel } = input

  if (status === 'live') {
    const stillThere = available.some(
      (c) => c.deviceId === current?.deviceId || c.label === current?.label
    )
    // No meio de um exame, trocar de câmera mudaria o que o médico está vendo
    // sem ele ter pedido. Só reportamos a perda.
    return stillThere ? { kind: 'ignore' } : { kind: 'lost' }
  }

  // A câmera de sempre reapareceu: reabre sem o usuário precisar clicar. O
  // identificador muda quando o cabo volta, então o nome também vale.
  const back = available.some(
    (c) =>
      (savedDeviceId !== '' && c.deviceId === savedDeviceId) ||
      (savedLabel !== '' && c.label === savedLabel)
  )
  if (back) return { kind: 'reopen' }

  // Conectaram uma câmera diferente da de costume — trocar de microscópio é
  // rotina. Miramos no identificador dela em vez de reabrir pela preferência
  // salva, que aponta para uma câmera que não está mais aqui.
  if (arrived.length > 0) return { kind: 'open', deviceId: arrived[0].deviceId }

  // Primeira execução, sem nada salvo: abre o que houver.
  if (available.length > 0 && savedLabel === '') return { kind: 'reopen' }

  return { kind: 'ignore' }
}
