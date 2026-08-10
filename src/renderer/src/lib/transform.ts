/**
 * Espelhamento e rotação da imagem.
 *
 * O microscópio quase sempre entrega a imagem invertida, então esse ajuste é a
 * primeira coisa que o usuário mexe. A mesma função desenha o que aparece na
 * tela e o que vai para o arquivo — o que se vê é o que se salva.
 */

export interface ViewTransform {
  flipH: boolean
  flipV: boolean
  rotation: 0 | 90 | 180 | 270
}

export const IDENTITY: ViewTransform = { flipH: false, flipV: false, rotation: 0 }

export function isIdentity(t: ViewTransform): boolean {
  return !t.flipH && !t.flipV && t.rotation === 0
}

/**
 * Ajuste feito por software, para as câmeras que não oferecem o controle no
 * próprio hardware. `1` é neutro em todos.
 */
export interface SoftwareFilter {
  brightness: number
  contrast: number
  saturation: number
}

export const NEUTRAL_FILTER: SoftwareFilter = { brightness: 1, contrast: 1, saturation: 1 }

export function isNeutral(f: SoftwareFilter): boolean {
  return f.brightness === 1 && f.contrast === 1 && f.saturation === 1
}

function filterString(f: SoftwareFilter): string {
  return `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturation})`
}

/** Tamanho da imagem depois de girada (90° e 270° trocam largura por altura). */
export function outputSize(
  sourceWidth: number,
  sourceHeight: number,
  t: ViewTransform
): { width: number; height: number } {
  const swap = t.rotation === 90 || t.rotation === 270
  return {
    width: swap ? sourceHeight : sourceWidth,
    height: swap ? sourceWidth : sourceHeight
  }
}

/**
 * Desenha o quadro aplicando espelhamento e rotação. `destWidth`/`destHeight`
 * já devem ser o resultado de `outputSize` (ou uma redução proporcional dele,
 * no caso da pré-visualização).
 */
export function drawTransformed(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
  t: ViewTransform,
  filter: SoftwareFilter = NEUTRAL_FILTER
): void {
  const swap = t.rotation === 90 || t.rotation === 270
  // Quanto o quadro original precisa encolher para caber no destino.
  const scale = swap ? destWidth / sourceHeight : destWidth / sourceWidth

  ctx.save()
  if (!isNeutral(filter)) ctx.filter = filterString(filter)
  ctx.translate(destWidth / 2, destHeight / 2)
  ctx.rotate((t.rotation * Math.PI) / 180)
  ctx.scale(t.flipH ? -scale : scale, t.flipV ? -scale : scale)
  ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight)
  ctx.restore()
}

/** Próxima rotação ao clicar no botão de girar. */
export function nextRotation(current: ViewTransform['rotation']): ViewTransform['rotation'] {
  const order: Array<ViewTransform['rotation']> = [0, 90, 180, 270]
  return order[(order.indexOf(current) + 1) % order.length]
}
