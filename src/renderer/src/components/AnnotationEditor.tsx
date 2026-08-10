import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Circle,
  Minus,
  MoveUpRight,
  Pencil,
  Save,
  Square,
  Type,
  Undo2,
  X
} from 'lucide-react'
import type { MediaItem } from '@shared/types'
import {
  ANNOTATION_COLORS,
  ANNOTATION_WIDTHS,
  drawShapes,
  type Shape,
  type ShapeKind
} from '../lib/shapes'
import { canvasToJpeg } from '../lib/capture'
import { useApp } from '../store'
import './AnnotationEditor.css'

/**
 * Editor de anotações sobre uma foto já capturada.
 *
 * A foto original nunca é alterada: o resultado vira um arquivo novo terminado
 * em `_anotada`, ligado ao original no banco. Em contexto médico, o registro
 * bruto precisa continuar existindo.
 */

const TOOLS: Array<{ kind: ShapeKind; label: string; icon: typeof Circle }> = [
  { kind: 'arrow', label: 'Seta', icon: MoveUpRight },
  { kind: 'line', label: 'Linha', icon: Minus },
  { kind: 'ellipse', label: 'Círculo', icon: Circle },
  { kind: 'rect', label: 'Retângulo', icon: Square },
  { kind: 'free', label: 'Traço livre', icon: Pencil },
  { kind: 'text', label: 'Texto', icon: Type }
]

export function AnnotationEditor({
  media,
  onClose,
  onSaved
}: {
  media: MediaItem
  onClose: () => void
  onSaved: (created: MediaItem) => void
}): React.JSX.Element {
  const quality = useApp((s) => s.settings.photoQuality)
  const notify = useApp((s) => s.notify)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [tool, setTool] = useState<ShapeKind>('arrow')
  const [color, setColor] = useState(ANNOTATION_COLORS[0])
  const [width, setWidth] = useState(ANNOTATION_WIDTHS[1])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [saving, setSaving] = useState(false)

  /** Texto sendo digitado: posição na imagem e conteúdo. */
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(
    null
  )

  const [size, setSize] = useState({ width: 0, height: 0 })

  // Carrega a foto original.
  useEffect(() => {
    const image = new Image()
    image.src = window.microazz.media.url(media.filePath)
    image.onload = () => {
      imageRef.current = image
      setSize({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => notify('Não foi possível abrir esta foto.', 'error')
  }, [media.filePath, notify])

  // Redesenha imagem + anotações sempre que algo muda.
  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !size.width) return

    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(image, 0, 0)
    drawShapes(ctx, draft ? [...shapes, draft] : shapes)
  }, [draft, shapes, size])

  /** Converte a posição do mouse para pixels da imagem original. */
  const toImagePoint = useCallback((event: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height
    ]
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent): void => {
      if (saving) return
      const [x, y] = toImagePoint(event)

      if (tool === 'text') {
        setPendingText({ x, y, value: '' })
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      setDraft(
        tool === 'free'
          ? { kind: 'free', points: [[x, y]], color, width }
          : { kind: tool, x1: x, y1: y, x2: x, y2: y, color, width }
      )
    },
    [color, saving, tool, toImagePoint, width]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent): void => {
      if (!draft) return
      const [x, y] = toImagePoint(event)
      setDraft((current) => {
        if (!current) return current
        if (current.kind === 'free') {
          return { ...current, points: [...current.points, [x, y] as [number, number]] }
        }
        return { ...current, x2: x, y2: y }
      })
    },
    [draft, toImagePoint]
  )

  const onPointerUp = useCallback((): void => {
    if (!draft) return
    // Clique sem arrastar não vira desenho.
    const meaningful =
      draft.kind === 'free'
        ? draft.points.length > 2
        : draft.kind === 'text'
          ? draft.text.trim().length > 0
          : Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 4

    if (meaningful) setShapes((list) => [...list, draft])
    setDraft(null)
  }, [draft])

  const commitText = useCallback((): void => {
    if (!pendingText) return
    const text = pendingText.value.trim()
    if (text) {
      setShapes((list) => [
        ...list,
        { kind: 'text', x: pendingText.x, y: pendingText.y, text, color, width }
      ])
    }
    setPendingText(null)
  }, [color, pendingText, width])

  const undo = useCallback((): void => setShapes((list) => list.slice(0, -1)), [])

  const save = useCallback(async (): Promise<void> => {
    const canvas = canvasRef.current
    if (!canvas || shapes.length === 0) {
      notify('Desenhe alguma coisa antes de salvar.', 'error')
      return
    }

    setSaving(true)
    try {
      const photo = await canvasToJpeg(canvas, quality)
      const created = await window.microazz.capture.photo({
        bytes: photo.bytes,
        width: photo.width,
        height: photo.height,
        suffix: '_anotada',
        annotatedFrom: media.id
      })
      onSaved(created)
      notify(`Imagem anotada salva: ${created.fileName}`)
      onClose()
    } catch (err) {
      notify(`Não foi possível salvar. ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [media.id, notify, onClose, onSaved, quality, shapes.length])

  // Esc fecha, Ctrl+Z desfaz.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (pendingText) setPendingText(null)
        else onClose()
      }
      if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pendingText, undo])

  return (
    <div className="editor" role="dialog" aria-label="Anotar imagem">
      <div className="editor__bar">
        <span className="editor__name">{media.fileName}</span>

        <div className="editor__tools">
          {TOOLS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              className={`tool ${tool === kind ? 'tool--on' : ''}`}
              onClick={() => setTool(kind)}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <div className="editor__colors">
          {ANNOTATION_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className={`swatch ${color === option ? 'swatch--on' : ''}`}
              style={{ background: option }}
              onClick={() => setColor(option)}
              title={`Cor ${option}`}
            />
          ))}
        </div>

        <div className="editor__widths">
          {ANNOTATION_WIDTHS.map((option) => (
            <button
              key={option}
              type="button"
              className={`tool ${width === option ? 'tool--on' : ''}`}
              onClick={() => setWidth(option)}
              title={`Espessura ${option}`}
            >
              <span className="widthdot" style={{ width: option + 2, height: option + 2 }} />
            </button>
          ))}
        </div>

        <button type="button" className="tool" onClick={undo} title="Desfazer (Ctrl+Z)">
          <Undo2 size={16} />
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="ctl ctl--primary"
          onClick={() => void save()}
          disabled={saving || shapes.length === 0}
        >
          <Save size={16} /> Salvar cópia anotada
        </button>
        <button type="button" className="tool" onClick={onClose} title="Fechar (Esc)">
          <X size={16} />
        </button>
      </div>

      <div className="editor__stage">
        <div className="editor__frame">
          <canvas
            ref={canvasRef}
            className="editor__canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {pendingText && (
            <input
              className="editor__text"
              autoFocus
              value={pendingText.value}
              placeholder="Digite e aperte Enter"
              onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText()
              }}
              style={{
                left: `${(pendingText.x / Math.max(size.width, 1)) * 100}%`,
                top: `${(pendingText.y / Math.max(size.height, 1)) * 100}%`,
                color
              }}
            />
          )}
        </div>
      </div>

      <div className="editor__hint">
        A foto original continua intacta — o resultado é gravado como um arquivo novo, terminado em{' '}
        <strong>_anotada</strong>.
      </div>
    </div>
  )
}
