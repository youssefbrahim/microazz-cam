import { useEffect, useRef, useState } from 'react'
import { Link, Unlink, X } from 'lucide-react'
import type { MediaItem } from '@shared/types'
import './CompareView.css'

/**
 * Duas capturas lado a lado, com zoom e arraste sincronizados.
 *
 * A sincronia é o ponto: comparar antes e depois só funciona se as duas imagens
 * estiverem no mesmo aumento e na mesma região. Dá para desligar a trava quando
 * as imagens não têm o mesmo enquadramento.
 */
export function CompareView({
  items,
  onClose
}: {
  items: MediaItem[]
  onClose: () => void
}): React.JSX.Element {
  const [linked, setLinked] = useState(true)
  const [views, setViews] = useState([
    { zoom: 1, x: 0, y: 0 },
    { zoom: 1, x: 0, y: 0 }
  ])
  const dragging = useRef<{ index: number; x: number; y: number } | null>(null)

  const update = (index: number, patch: Partial<{ zoom: number; x: number; y: number }>): void => {
    setViews((current) =>
      current.map((view, i) =>
        linked || i === index ? { ...view, ...patch } : view
      )
    )
  }

  const zoomBy = (index: number, delta: number): void => {
    setViews((current) => {
      const base = current[index]
      const zoom = Math.min(Math.max(base.zoom * (1 + delta), 1), 12)
      const next = zoom === 1 ? { zoom, x: 0, y: 0 } : { ...base, zoom }
      return current.map((view, i) =>
        linked ? (zoom === 1 ? { zoom, x: 0, y: 0 } : { ...view, zoom }) : i === index ? next : view
      )
    })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="compare" role="dialog" aria-label="Comparar capturas">
      <div className="viewer__bar">
        <strong style={{ fontSize: 13 }}>Comparação</strong>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className={`ctl ${linked ? 'ctl--on' : ''}`}
          onClick={() => setLinked((value) => !value)}
          title={
            linked
              ? 'Zoom e posição travados nas duas imagens'
              : 'Cada imagem se move por conta própria'
          }
        >
          {linked ? <Link size={15} /> : <Unlink size={15} />}
          {linked ? 'Travado' : 'Livre'}
        </button>
        <button type="button" className="tool" onClick={onClose} title="Fechar (Esc)">
          <X size={16} />
        </button>
      </div>

      <div className="compare__panes">
        {items.slice(0, 2).map((item, index) => (
          <div
            key={item.id}
            className="compare__pane"
            onWheel={(e) => zoomBy(index, e.deltaY < 0 ? 0.15 : -0.13)}
            onPointerDown={(e) => {
              if (views[index].zoom <= 1) return
              dragging.current = {
                index,
                x: e.clientX - views[index].x,
                y: e.clientY - views[index].y
              }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const drag = dragging.current
              if (!drag) return
              update(drag.index, { x: e.clientX - drag.x, y: e.clientY - drag.y })
            }}
            onPointerUp={() => {
              dragging.current = null
            }}
          >
            <img
              src={window.microazz.media.url(item.filePath)}
              alt={item.fileName}
              draggable={false}
              style={{
                transform: `translate(${views[index].x}px, ${views[index].y}px) scale(${views[index].zoom})`
              }}
            />
            <span className="compare__label">{item.fileName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
