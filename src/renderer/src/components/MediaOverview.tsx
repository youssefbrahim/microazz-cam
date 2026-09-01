import { useMemo, useState } from 'react'
import {
  Camera,
  ChevronDown,
  CloudCheck,
  CloudUpload,
  FolderOpen,
  GalleryHorizontal,
  Images,
  LayoutGrid,
  Pencil,
  Trash2,
  TriangleAlert,
  Video
} from 'lucide-react'
import type { MediaItem } from '@shared/types'
import { MediaViewer } from './MediaViewer'
import { useApp } from '../store'
import './MediaOverview.css'

/**
 * Painel de capturas da tela principal.
 *
 * Substitui a antiga tira de miniaturas. A diferença não é estética: durante o
 * exame o médico precisa saber *o que já tem* antes de decidir se fotografa de
 * novo — quantas fotos, quantos vídeos, o que já subiu para o Drive. A tira só
 * mostrava os últimos arquivos, e qualquer conferência exigia trocar de tela.
 *
 * São três estados, guardados nas configurações para o programa reabrir do
 * jeito que cada consultório trabalha:
 *   tira    — faixa horizontal, ocupa pouco e deixa a imagem ao vivo grande
 *   grade   — visão geral do exame inteiro, para conferir o conjunto
 *   fechado — só o cabeçalho com as contagens; a imagem fica com o resto
 */

export type OverviewMode = 'strip' | 'grid' | 'hidden'
type OpenMode = Exclude<OverviewMode, 'hidden'>
type Filter = 'all' | 'photo' | 'video'

/** O valor vem do banco, então pode ser qualquer texto: o desconhecido vira tira. */
export function normalizeOverviewMode(value: string): OverviewMode {
  return value === 'grid' || value === 'hidden' ? value : 'strip'
}

export function MediaOverview({
  items,
  contextLabel,
  folder,
  onAnnotate,
  onRemove
}: {
  items: MediaItem[]
  /** Paciente e exame que estão recebendo as capturas, já com a privacidade aplicada. */
  contextLabel: string
  /** Pasta do exame em disco, para o botão que abre o Explorer. */
  folder?: string
  onAnnotate: (item: MediaItem) => void
  onRemove: (item: MediaItem) => void
}): React.JSX.Element {
  const mode = normalizeOverviewMode(useApp((s) => s.settings.overviewMode))
  const updateSettings = useApp((s) => s.updateSettings)
  const goTo = useApp((s) => s.goTo)

  // Lembra o formato aberto para o cabeçalho devolver o painel ao estado de
  // antes, e não sempre à tira.
  const [lastOpen, setLastOpen] = useState<OpenMode>(mode === 'hidden' ? 'strip' : mode)
  const [filter, setFilter] = useState<Filter>('all')
  const [viewing, setViewing] = useState<MediaItem | null>(null)

  const photos = useMemo(() => items.filter((i) => i.kind === 'photo').length, [items])
  const videos = items.length - photos

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [filter, items]
  )

  const changeMode = (next: OverviewMode): void => {
    if (next !== 'hidden') setLastOpen(next)
    void updateSettings({ overviewMode: next })
  }

  const open = (item: MediaItem): void => {
    // Vídeo vai para o player do Windows; foto abre o visualizador com zoom,
    // que é o que se faz com uma captura recém-tirada: conferir o detalhe.
    if (item.kind === 'video') void window.microazz.app.openPath(item.filePath)
    else setViewing(item)
  }

  return (
    <section className={`overview overview--${mode}`} aria-label="Capturas deste exame">
      <header className="overview__head">
        <button
          type="button"
          className="overview__toggle"
          onClick={() => changeMode(mode === 'hidden' ? lastOpen : 'hidden')}
          aria-expanded={mode !== 'hidden'}
          title={mode === 'hidden' ? 'Mostrar as capturas' : 'Esconder e ampliar a imagem'}
        >
          <Images size={16} />
          Capturas
          <ChevronDown className="overview__chev" size={15} />
        </button>

        <span className="overview__ctx" title={contextLabel}>
          {contextLabel}
        </span>

        <span className="ocount" title={`${photos} foto(s) neste exame`}>
          <Camera size={12} /> {photos}
        </span>
        <span className="ocount" title={`${videos} vídeo(s) neste exame`}>
          <Video size={12} /> {videos}
        </span>

        <div className="overview__spacer" />

        {items.length > 0 && mode !== 'hidden' && (
          <div className="overview__filters">
            {(
              [
                ['all', 'Tudo'],
                ['photo', 'Fotos'],
                ['video', 'Vídeos']
              ] as Array<[Filter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`ochip ${filter === value ? 'ochip--on' : ''}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="oseg" role="group" aria-label="Formato do painel">
          <button
            type="button"
            className={mode === 'strip' ? 'oseg--on' : ''}
            onClick={() => changeMode('strip')}
            title="Tira: ocupa pouco espaço"
          >
            <GalleryHorizontal size={14} /> Tira
          </button>
          <button
            type="button"
            className={mode === 'grid' ? 'oseg--on' : ''}
            onClick={() => changeMode('grid')}
            title="Grade: visão geral do exame"
          >
            <LayoutGrid size={14} /> Grade
          </button>
        </div>

        {folder && (
          <button
            type="button"
            className="oicon"
            onClick={() => void window.microazz.app.openPath(folder)}
            title="Abrir a pasta deste exame"
          >
            <FolderOpen size={15} />
          </button>
        )}

        <button
          type="button"
          className="oicon oicon--wide"
          onClick={() => goTo('gallery')}
          title="Abrir a galeria com todos os exames"
        >
          Galeria
        </button>
      </header>

      {mode !== 'hidden' && (
        <div className="overview__body">
          {visible.length === 0 ? (
            <p className="overview__empty">
              {items.length === 0
                ? 'As capturas deste exame aparecem aqui assim que você fotografar.'
                : 'Nada nesta categoria.'}
            </p>
          ) : (
            visible.map((item, index) => (
              <MediaCard
                key={item.id}
                item={item}
                latest={index === 0 && filter === 'all'}
                onOpen={open}
                onAnnotate={onAnnotate}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      )}

      {viewing && (
        <MediaViewer
          media={viewing}
          onClose={() => setViewing(null)}
          onAnnotate={() => {
            onAnnotate(viewing)
            setViewing(null)
          }}
        />
      )}
    </section>
  )
}

function MediaCard({
  item,
  latest,
  onOpen,
  onAnnotate,
  onRemove
}: {
  item: MediaItem
  /** A captura mais recente ganha um contorno: é a que acabou de ser feita. */
  latest: boolean
  onOpen: (item: MediaItem) => void
  onAnnotate: (item: MediaItem) => void
  onRemove: (item: MediaItem) => void
}): React.JSX.Element {
  const isVideo = item.kind === 'video'

  return (
    <figure className={`omedia ${latest ? 'omedia--new' : ''}`}>
      {/*
        Selos e ferramentas ficam presos a esta caixa, e não ao cartão inteiro:
        o cartão tem legenda na grade e não tem na tira, então ancorar pelo
        cartão deslocaria tudo de um formato para o outro.
      */}
      <div className="omedia__thumb">
        <button
          type="button"
          className="omedia__open"
          onClick={() => onOpen(item)}
          title={
            isVideo
              ? `${item.fileName} — clique para assistir`
              : `${item.fileName} — clique para ampliar`
          }
        >
          {isVideo ? (
            <span className="omedia__vid">
              <Video size={22} />
            </span>
          ) : (
            <img
              src={window.microazz.media.url(item.filePath)}
              alt={item.fileName}
              loading="lazy"
            />
          )}
        </button>

        <DriveMark item={item} />

        {isVideo && item.durationMs !== null && (
          <span className="omedia__tag">{formatDuration(item.durationMs)}</span>
        )}

        <div className="omedia__tools">
          {!isVideo && (
            <button type="button" onClick={() => onAnnotate(item)} title="Anotar sobre a foto">
              <Pencil size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void window.microazz.app.revealPath(item.filePath)}
            title="Mostrar no Explorer"
          >
            <FolderOpen size={13} />
          </button>
          <button
            type="button"
            className="omedia__danger"
            onClick={() => onRemove(item)}
            title="Mandar para a Lixeira do Windows"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <figcaption className="omedia__foot">
        <span className="omedia__name" title={item.fileName}>
          {item.fileName}
        </span>
        <span className="omedia__time">{formatTime(item.createdAt)}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Situação do envio ao Google Drive, no canto da miniatura. Só aparece quando
 * há algo a dizer — arquivo que ficou só no computador não vira selo.
 */
function DriveMark({ item }: { item: MediaItem }): React.JSX.Element | null {
  if (item.driveStatus === 'local') return null

  if (item.driveStatus === 'uploaded') {
    return (
      <span className="omedia__drive omedia__drive--ok" title="Enviado ao Google Drive">
        <CloudCheck size={13} />
      </span>
    )
  }

  if (item.driveStatus === 'error') {
    return (
      <span className="omedia__drive omedia__drive--err" title="Falha no envio ao Google Drive">
        <TriangleAlert size={13} />
      </span>
    )
  }

  return (
    <span className="omedia__drive omedia__drive--busy" title="Aguardando envio ao Google Drive">
      <CloudUpload size={13} />
    </span>
  )
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/** Hora da captura ("14:32"). A data não entra: o painel é sempre do exame atual. */
function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
