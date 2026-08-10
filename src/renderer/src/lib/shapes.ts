/**
 * Desenhos feitos sobre uma foto (setas, círculos, texto).
 *
 * As coordenadas são sempre em pixels da imagem original, nunca da tela: assim
 * a anotação sai no lugar certo tanto na pré-visualização reduzida quanto no
 * arquivo final em resolução cheia.
 */

export type ShapeKind = 'arrow' | 'line' | 'rect' | 'ellipse' | 'free' | 'text'

interface Base {
  color: string
  width: number
}

export type Shape =
  | (Base & { kind: 'arrow' | 'line' | 'rect' | 'ellipse'; x1: number; y1: number; x2: number; y2: number })
  | (Base & { kind: 'free'; points: Array<[number, number]> })
  | (Base & { kind: 'text'; x: number; y: number; text: string })

export const ANNOTATION_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#2563eb',
  '#a855f7',
  '#ffffff',
  '#000000'
]

/** Espessuras oferecidas, em pixels da imagem original. */
export const ANNOTATION_WIDTHS = [2, 4, 8, 14]

function drawArrowHead(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(width * 3.5, 10)

  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7))
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
}

export function drawShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: Shape
): void {
  ctx.save()
  ctx.strokeStyle = shape.color
  ctx.fillStyle = shape.color
  ctx.lineWidth = shape.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (shape.kind) {
    case 'line':
    case 'arrow': {
      ctx.beginPath()
      ctx.moveTo(shape.x1, shape.y1)
      ctx.lineTo(shape.x2, shape.y2)
      ctx.stroke()
      if (shape.kind === 'arrow') {
        drawArrowHead(ctx, shape.x1, shape.y1, shape.x2, shape.y2, shape.width)
      }
      break
    }
    case 'rect': {
      ctx.strokeRect(
        Math.min(shape.x1, shape.x2),
        Math.min(shape.y1, shape.y2),
        Math.abs(shape.x2 - shape.x1),
        Math.abs(shape.y2 - shape.y1)
      )
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(
        (shape.x1 + shape.x2) / 2,
        (shape.y1 + shape.y2) / 2,
        Math.abs(shape.x2 - shape.x1) / 2,
        Math.abs(shape.y2 - shape.y1) / 2,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()
      break
    }
    case 'free': {
      if (shape.points.length < 2) break
      ctx.beginPath()
      ctx.moveTo(shape.points[0][0], shape.points[0][1])
      for (const [x, y] of shape.points.slice(1)) ctx.lineTo(x, y)
      ctx.stroke()
      break
    }
    case 'text': {
      const size = shape.width * 6
      ctx.font = `600 ${size}px Poppins, sans-serif`
      ctx.textBaseline = 'top'
      // Contorno escuro para o texto continuar legível sobre fundo claro.
      ctx.strokeStyle = '#00000099'
      ctx.lineWidth = Math.max(size / 8, 2)
      ctx.strokeText(shape.text, shape.x, shape.y)
      ctx.fillText(shape.text, shape.x, shape.y)
      break
    }
  }

  ctx.restore()
}

export function drawShapes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shapes: Shape[]
): void {
  for (const shape of shapes) drawShape(ctx, shape)
}
