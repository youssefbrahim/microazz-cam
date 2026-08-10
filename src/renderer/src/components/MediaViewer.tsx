import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Pencil, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import './MediaViewer.css'

/**
 * Visualizador de foto com zoom e arraste.
 *
 * Zoom é o que o médico mais usa depois de capturar — ampliar um detalhe sem
 * precisar voltar ao microscópio.
 */
export function MediaViewer({
  media,
  onClose,
  onAnnotate
}: {
  media: MediaItem
  onClose: () => void
  onAnnotate?: () => void
}): React.JSX.Element {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ x: number; y: number } | null>(null)

  const reset = useCallback((): void => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const changeZoom = useCallback((delta: number): void => {
    setZoom((current) => {
      const next = Math.min(Math.max(current * (1 + delta), 1), 12)
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === '+' || event.key === '=') changeZoom(0.25)
      if (event.key === '-') changeZoom(-0.2)
      if (event.key === '0') reset()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeZoom, onClose, reset])

  return (
    <div className="viewer" role="dialog" aria-label={media.fileName}>
      <div className="viewer__bar">
        <span className="viewer__name">{media.fileName}</span>
        {media.width && media.height && (
          <span className="viewer__meta">
            {media.width} × {media.height}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="tool" onClick={() => changeZoom(-0.2)} title="Afastar">
          <ZoomOut size={16} />
        </button>
        <span className="viewer__zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="tool" onClick={() => changeZoom(0.25)} title="Aproximar">
          <ZoomIn size={16} />
        </button>
        <button type="button" className="tool" onClick={reset} title="Tamanho original (0)">
          <Maximize2 size={16} />
        </button>
        {onAnnotate && (
          <button type="button" className="ctl ctl--primary" onClick={onAnnotate}>
            <Pencil size={15} /> Anotar
          </button>
        )}
        <button type="button" className="tool" onClick={onClose} title="Fechar (Esc)">
          <X size={16} />
        </button>
      </div>

      <div
        className="viewer__stage"
        onWheel={(e) => changeZoom(e.deltaY < 0 ? 0.15 : -0.13)}
        onPointerDown={(e) => {
          if (zoom <= 1) return
          dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y })
        }}
        onPointerUp={() => {
          dragging.current = null
        }}
        style={{ cursor: zoom > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={window.microazz.media.url(media.filePath)}
          alt={media.fileName}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        />
      </div>
    </div>
  )
}
