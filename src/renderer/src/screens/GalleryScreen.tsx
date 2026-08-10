import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns2, FolderOpen, Image as ImageIcon, Pencil, Trash2, Video } from 'lucide-react'
import type { Exam, MediaItem } from '@shared/types'
import { formatDateBr } from '@shared/naming'
import { AnnotationEditor } from '../components/AnnotationEditor'
import { CompareView } from '../components/CompareView'
import { MediaViewer } from '../components/MediaViewer'
import { useApp } from '../store'
import './GalleryScreen.css'

type ExamRow = Exam & { patientName: string; isSystem: boolean }
type Filter = 'all' | 'photo' | 'video'

/** Fotos, vídeos e laudos já gravados, organizados por exame. */
export function GalleryScreen(): React.JSX.Element {
  const notify = useApp((s) => s.notify)
  const privacyMode = useApp((s) => s.settings.privacyMode)
  const context = useApp((s) => s.context)

  const [exams, setExams] = useState<ExamRow[]>([])
  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')

  const [viewing, setViewing] = useState<MediaItem | null>(null)
  const [annotating, setAnnotating] = useState<MediaItem | null>(null)
  const [comparing, setComparing] = useState<MediaItem[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const loadExams = useCallback((): void => {
    void window.microazz.media.allExams().then((list) => {
      setExams(list)
      setSelectedExam((current) => {
        if (current) return list.find((e) => e.id === current.id) ?? list[0] ?? null
        return list.find((e) => e.id === context?.examId) ?? list[0] ?? null
      })
    })
  }, [context?.examId])

  useEffect(loadExams, [loadExams])

  const loadMedia = useCallback((examId: number): void => {
    void window.microazz.media.forExam(examId).then(setMedia)
  }, [])

  useEffect(() => {
    if (selectedExam) loadMedia(selectedExam.id)
    setPicked(new Set())
  }, [loadMedia, selectedExam])

  const visible = useMemo(
    () => (filter === 'all' ? media : media.filter((m) => m.kind === filter)),
    [filter, media]
  )

  const photos = useMemo(() => media.filter((m) => m.kind === 'photo'), [media])
  const pickedPhotos = useMemo(
    () => photos.filter((p) => picked.has(p.id)),
    [photos, picked]
  )

  const togglePick = useCallback((id: number): void => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const remove = useCallback(
    (item: MediaItem): void => {
      void window.microazz.media.remove(item.id).then(() => {
        setMedia((list) => list.filter((m) => m.id !== item.id))
        setViewing(null)
        notify(`"${item.fileName}" foi para a Lixeira do Windows.`)
      })
    },
    [notify]
  )

  const compare = useCallback((): void => {
    if (pickedPhotos.length !== 2) {
      notify('Marque exatamente duas fotos para comparar.', 'error')
      return
    }
    setComparing(pickedPhotos)
  }, [notify, pickedPhotos])

  return (
    <div className="screen screen--split gallery">
      <div className="gallery__side">
          <div className="gallery__sidehead">Exames</div>
          <div className="gallery__exams">
            {exams.length === 0 && (
              <p className="patients__empty">Nenhuma captura ainda.</p>
            )}
            {exams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                className={`patients__item ${selectedExam?.id === exam.id ? 'patients__item--on' : ''}`}
                onClick={() => setSelectedExam(exam)}
              >
                <strong>
                  {exam.isSystem ? 'Sem paciente' : privacyMode ? '•••••' : exam.patientName}
                </strong>
                <small>
                  {exam.title} · {formatDateBr(exam.examDate)}
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="gallery__main">
          {!selectedExam ? (
            <div className="screen__inner">
              <h1 className="screen__title">Galeria</h1>
              <p className="screen__lead">
                Assim que você fizer a primeira captura, ela aparece aqui.
              </p>
            </div>
          ) : (
            <>
              <div className="gallery__head">
                <div>
                  <h1 className="screen__title" style={{ fontSize: 20 }}>
                    {selectedExam.isSystem
                      ? 'Capturas avulsas'
                      : privacyMode
                        ? '•••••'
                        : selectedExam.patientName}
                  </h1>
                  <p className="screen__lead" style={{ margin: 0 }}>
                    {selectedExam.title} · {formatDateBr(selectedExam.examDate)} · {media.length}{' '}
                    arquivo(s)
                  </p>
                </div>

                <div className="gallery__filters">
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
                      className={`gchip ${filter === value ? 'gchip--on' : ''}`}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gallery__actions">
                <span className="gallery__count">
                  {picked.size > 0
                    ? `${picked.size} foto(s) marcada(s)`
                    : 'Marque duas fotos no canto da miniatura para comparar lado a lado.'}
                </span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={compare}
                  disabled={pickedPhotos.length !== 2}
                >
                  <Columns2 size={16} /> Comparar
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void window.microazz.app.openPath(selectedExam.folder)}
                  title="Abrir a pasta deste exame"
                >
                  <FolderOpen size={16} />
                </button>
              </div>

              <div className="grid">
                {visible.length === 0 && (
                  <p className="patients__empty">Nada nesta categoria.</p>
                )}
                {visible.map((item) => (
                  <div className="gcard" key={item.id}>
                    <button
                      type="button"
                      className="gcard__preview"
                      onClick={() => {
                        if (item.kind === 'photo') setViewing(item)
                        else void window.microazz.app.openPath(item.filePath)
                      }}
                      title={item.fileName}
                    >
                      {item.kind === 'photo' ? (
                        <img src={window.microazz.media.url(item.filePath)} alt={item.fileName} />
                      ) : (
                        <span className="gcard__icon">
                          <Video size={26} />
                        </span>
                      )}
                    </button>

                    {item.kind === 'photo' && (
                      <label className="gcard__pick" title="Marcar para comparar ou para o laudo">
                        <input
                          type="checkbox"
                          checked={picked.has(item.id)}
                          onChange={() => togglePick(item.id)}
                        />
                      </label>
                    )}

                    <div className="gcard__foot">
                      <span className="gcard__name" title={item.fileName}>
                        {item.fileName}
                      </span>
                      <div className="gcard__tools">
                        {item.kind === 'photo' && (
                          <button
                            type="button"
                            onClick={() => setAnnotating(item)}
                            title="Anotar"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void window.microazz.app.revealPath(item.filePath)}
                          title="Mostrar no Explorer"
                        >
                          <ImageIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="gcard__danger"
                          onClick={() => remove(item)}
                          title="Mandar para a Lixeira"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {viewing && (
        <MediaViewer
          media={viewing}
          onClose={() => setViewing(null)}
          onAnnotate={() => {
            setAnnotating(viewing)
            setViewing(null)
          }}
        />
      )}

      {annotating && (
        <AnnotationEditor
          media={annotating}
          onClose={() => setAnnotating(null)}
          onSaved={() => selectedExam && loadMedia(selectedExam.id)}
        />
      )}

      {comparing && <CompareView items={comparing} onClose={() => setComparing(null)} />}
    </div>
  )
}
