import { useCallback, useEffect, useState } from 'react'
import { CalendarPlus, Camera, FolderOpen, Search, Trash2, UserPlus } from 'lucide-react'
import type { Exam, Patient } from '@shared/types'
import { formatDateBr } from '@shared/naming'
import { useApp } from '../store'
import './PatientsScreen.css'

/** Cadastro de pacientes e dos exames de cada um. */
export function PatientsScreen(): React.JSX.Element {
  const notify = useApp((s) => s.notify)
  const setExam = useApp((s) => s.setExam)
  const goTo = useApp((s) => s.goTo)
  const context = useApp((s) => s.context)

  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [selected, setSelected] = useState<Patient | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [counts, setCounts] = useState<Record<number, { photos: number; videos: number }>>({})

  const [form, setForm] = useState({ name: '', document: '', birthDate: '', notes: '' })
  const [newExamTitle, setNewExamTitle] = useState('')

  const loadPatients = useCallback((): void => {
    void window.microazz.patients.list(search).then(setPatients)
  }, [search])

  useEffect(loadPatients, [loadPatients])

  const loadExams = useCallback((patientId: number): void => {
    void Promise.all([
      window.microazz.exams.list(patientId),
      window.microazz.exams.counts(patientId)
    ]).then(([list, totals]) => {
      setExams(list)
      setCounts(totals)
    })
  }, [])

  const select = useCallback(
    (patient: Patient): void => {
      setSelected(patient)
      setForm({
        name: patient.name,
        document: patient.document ?? '',
        birthDate: patient.birthDate ?? '',
        notes: patient.notes ?? ''
      })
      setNewExamTitle('')
      loadExams(patient.id)
    },
    [loadExams]
  )

  const startNew = useCallback((): void => {
    setSelected(null)
    setExams([])
    setForm({ name: '', document: '', birthDate: '', notes: '' })
  }, [])

  const save = useCallback((): void => {
    const payload = {
      name: form.name.trim(),
      document: form.document.trim() || null,
      birthDate: form.birthDate.trim() || null,
      notes: form.notes.trim() || null
    }
    if (!payload.name) {
      notify('Informe o nome do paciente.', 'error')
      return
    }

    const action = selected
      ? window.microazz.patients.update(selected.id, payload)
      : window.microazz.patients.create(payload)

    void action
      .then((patient) => {
        loadPatients()
        select(patient)
        notify(selected ? 'Cadastro atualizado.' : `Paciente "${patient.name}" cadastrado.`)
      })
      .catch((err: unknown) => notify(cleanError(err), 'error'))
  }, [form, loadPatients, notify, select, selected])

  const remove = useCallback((): void => {
    if (!selected) return
    void window.microazz.patients
      .remove(selected.id)
      .then(() => {
        notify(`Paciente "${selected.name}" excluído.`)
        startNew()
        loadPatients()
      })
      .catch((err: unknown) => notify(cleanError(err), 'error'))
  }, [loadPatients, notify, selected, startNew])

  const createExam = useCallback((): void => {
    if (!selected) return
    void window.microazz.exams
      .create({ patientId: selected.id, title: newExamTitle })
      .then(async (exam) => {
        setNewExamTitle('')
        loadExams(selected.id)
        await setExam(exam.id)
        notify(`Exame "${exam.title}" aberto. A captura já está apontada para ele.`)
      })
      .catch((err: unknown) => notify(cleanError(err), 'error'))
  }, [loadExams, newExamTitle, notify, selected, setExam])

  const captureInExam = useCallback(
    (exam: Exam): void => {
      void setExam(exam.id).then(() => {
        goTo('capture')
        notify(`Capturando em "${exam.title}".`)
      })
    },
    [goTo, notify, setExam]
  )

  return (
    <div className="screen screen--split patients">
      <div className="patients__list">
          <div className="patients__search">
            <Search size={15} />
            <input
              placeholder="Buscar paciente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button type="button" className="btn btn--primary patients__new" onClick={startNew}>
            <UserPlus size={16} /> Novo paciente
          </button>

          <div className="patients__scroll">
            {patients.length === 0 && (
              <p className="patients__empty">
                {search ? `Nada encontrado com “${search}”.` : 'Nenhum paciente cadastrado ainda.'}
              </p>
            )}
            {patients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                className={`patients__item ${selected?.id === patient.id ? 'patients__item--on' : ''}`}
                onClick={() => select(patient)}
              >
                <strong>{patient.name}</strong>
                {patient.document && <small>{patient.document}</small>}
              </button>
            ))}
          </div>
        </div>

        <div className="patients__detail">
          <h1 className="screen__title">{selected ? selected.name : 'Novo paciente'}</h1>
          <p className="screen__lead">
            {selected
              ? 'Edite o cadastro ou abra um exame para começar a capturar.'
              : 'Preencha o nome para cadastrar. Os demais campos são opcionais.'}
          </p>

          <div className="card">
            <h2 className="card__title">Cadastro</h2>
            <div className="formgrid">
              <label>
                Nome completo
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Maria Aparecida Silva"
                />
              </label>
              <label>
                Documento (CPF, prontuário)
                <input
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </label>
              <label>
                Data de nascimento
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </label>
              <label className="formgrid__wide">
                Observações
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={save}>
                {selected ? 'Salvar alterações' : 'Cadastrar paciente'}
              </button>
              {selected && (
                <button type="button" className="btn btn--danger" onClick={remove}>
                  <Trash2 size={16} /> Excluir
                </button>
              )}
            </div>
          </div>

          {selected && (
            <div className="card">
              <h2 className="card__title">Exames</h2>

              {exams.length === 0 && (
                <p className="patients__empty" style={{ margin: '0 0 12px' }}>
                  Nenhum exame ainda.
                </p>
              )}

              {exams.map((exam) => {
                const total = counts[exam.id]
                const active = context?.examId === exam.id
                return (
                  <div className={`examrow ${active ? 'examrow--on' : ''}`} key={exam.id}>
                    <div className="examrow__info">
                      <strong>{exam.title}</strong>
                      <small>
                        {formatDateBr(exam.examDate)} ·{' '}
                        {total ? `${total.photos} foto(s), ${total.videos} vídeo(s)` : 'vazio'}
                        {active && ' · recebendo capturas agora'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => captureInExam(exam)}
                      title="Apontar a captura para este exame"
                    >
                      <Camera size={15} /> Capturar
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void window.microazz.app.openPath(exam.folder)}
                      title="Abrir a pasta deste exame no Explorer"
                    >
                      <FolderOpen size={15} />
                    </button>
                  </div>
                )
              })}

              <div className="examadd">
                <input
                  placeholder="Título do novo exame (ex.: Biópsia de pele)"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createExam()
                  }}
                />
                <button type="button" className="btn btn--primary" onClick={createExam}>
                  <CalendarPlus size={16} /> Abrir exame
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

/** Tira o "Error:" que o Electron acrescenta ao repassar a exceção. */
function cleanError(err: unknown): string {
  return String(err).replace(/^Error:\s*/i, '').replace(/^.*Error invoking remote method '[^']*':\s*/i, '')
}
