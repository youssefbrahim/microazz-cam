import { useCallback, useEffect, useState } from 'react'
import { CalendarPlus, Search, UserPlus, UserX, X } from 'lucide-react'
import type { Exam, Patient } from '@shared/types'
import { formatDateBr } from '@shared/naming'
import { useApp } from '../store'
import './PatientPicker.css'

/**
 * Troca rápida de paciente e exame, no meio do atendimento.
 *
 * A ordem importa: escolhe-se o paciente à esquerda e o exame à direita. Um
 * paciente novo pode ser criado sem sair da janela, porque na prática o cadastro
 * acontece com o paciente já sentado na cadeira.
 */
export function PatientPicker({ onClose }: { onClose: () => void }): React.JSX.Element {
  const context = useApp((s) => s.context)
  const setExam = useApp((s) => s.setExam)
  const notify = useApp((s) => s.notify)

  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [selected, setSelected] = useState<Patient | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [counts, setCounts] = useState<Record<number, { photos: number; videos: number }>>({})

  const [newPatientName, setNewPatientName] = useState('')
  const [newExamTitle, setNewExamTitle] = useState('')

  const loadPatients = useCallback((): void => {
    void window.microazz.patients.list(search).then(setPatients)
  }, [search])

  useEffect(loadPatients, [loadPatients])

  const loadExams = useCallback((patient: Patient): void => {
    void Promise.all([
      window.microazz.exams.list(patient.id),
      window.microazz.exams.counts(patient.id)
    ]).then(([list, totals]) => {
      setExams(list)
      setCounts(totals)
    })
  }, [])

  const selectPatient = useCallback(
    (patient: Patient): void => {
      setSelected(patient)
      setNewExamTitle('')
      loadExams(patient)
    },
    [loadExams]
  )

  const createPatient = useCallback((): void => {
    const name = newPatientName.trim()
    if (!name) return
    void window.microazz.patients
      .create({ name })
      .then((patient) => {
        setNewPatientName('')
        setSearch('')
        loadPatients()
        selectPatient(patient)
        notify(`Paciente "${patient.name}" cadastrado.`)
      })
      .catch((err: unknown) => notify(String(err), 'error'))
  }, [loadPatients, newPatientName, notify, selectPatient])

  const createExam = useCallback((): void => {
    if (!selected) return
    void window.microazz.exams
      .create({ patientId: selected.id, title: newExamTitle })
      .then(async (exam) => {
        await setExam(exam.id)
        notify(`Exame "${exam.title}" aberto para ${selected.name}.`)
        onClose()
      })
      .catch((err: unknown) => notify(String(err), 'error'))
  }, [newExamTitle, notify, onClose, selected, setExam])

  const useExam = useCallback(
    (exam: Exam): void => {
      void setExam(exam.id).then(() => {
        notify(`Capturando em "${exam.title}".`)
        onClose()
      })
    },
    [notify, onClose, setExam]
  )

  const useLoose = useCallback((): void => {
    void setExam(null).then(() => {
      notify('Capturas voltaram para a pasta de avulsas.')
      onClose()
    })
  }, [notify, onClose, setExam])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="picker__backdrop" onPointerDown={onClose}>
      <div
        className="picker"
        role="dialog"
        aria-label="Escolher paciente e exame"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="picker__head">
          <strong>Paciente e exame</strong>
          <button type="button" className="picker__close" onClick={onClose} title="Fechar (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="picker__cols">
          <div className="picker__col">
            <div className="picker__search">
              <Search size={15} />
              <input
                autoFocus
                placeholder="Buscar por nome ou documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="picker__list">
              <button
                type="button"
                className={`picker__item ${context?.isLoose ? 'picker__item--on' : ''}`}
                onClick={useLoose}
              >
                <UserX size={15} />
                <span>
                  Sem paciente
                  <small>capturas avulsas do dia</small>
                </span>
              </button>

              {patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className={`picker__item ${selected?.id === patient.id ? 'picker__item--on' : ''}`}
                  onClick={() => selectPatient(patient)}
                >
                  <span>
                    {patient.name}
                    {patient.document && <small>{patient.document}</small>}
                  </span>
                </button>
              ))}

              {patients.length === 0 && search && (
                <p className="picker__empty">Nenhum paciente encontrado com “{search}”.</p>
              )}
            </div>

            <div className="picker__add">
              <input
                placeholder="Nome do novo paciente"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createPatient()
                }}
              />
              <button
                type="button"
                className="picker__addbtn"
                onClick={createPatient}
                disabled={!newPatientName.trim()}
                title="Cadastrar paciente"
              >
                <UserPlus size={16} />
              </button>
            </div>
          </div>

          <div className="picker__col">
            {!selected ? (
              <p className="picker__empty" style={{ padding: 16 }}>
                Escolha um paciente à esquerda para ver os exames dele.
              </p>
            ) : (
              <>
                <div className="picker__colhead">Exames de {selected.name}</div>

                <div className="picker__list">
                  {exams.length === 0 && (
                    <p className="picker__empty">
                      Nenhum exame ainda. Crie o primeiro no campo abaixo.
                    </p>
                  )}
                  {exams.map((exam) => {
                    const total = counts[exam.id]
                    return (
                      <button
                        key={exam.id}
                        type="button"
                        className={`picker__item ${
                          context?.examId === exam.id ? 'picker__item--on' : ''
                        }`}
                        onClick={() => useExam(exam)}
                      >
                        <span>
                          {exam.title}
                          <small>
                            {formatDateBr(exam.examDate)}
                            {total
                              ? ` · ${total.photos} foto(s), ${total.videos} vídeo(s)`
                              : ' · vazio'}
                          </small>
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="picker__add">
                  <input
                    placeholder="Título do exame (ex.: Biópsia)"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createExam()
                    }}
                  />
                  <button
                    type="button"
                    className="picker__addbtn"
                    onClick={createExam}
                    title="Abrir novo exame"
                  >
                    <CalendarPlus size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
