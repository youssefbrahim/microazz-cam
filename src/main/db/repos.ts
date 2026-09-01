import { join } from 'node:path'
import type { Exam, MediaItem, MediaKind, Patient } from '@shared/types'
import { examFolderName, formatDate, sanitizeName } from '@shared/naming'
import { getDatabase, queryAll, queryOne } from './connection.js'
import { ensureDir } from '../paths.js'
import { mediaRoot } from '../storage.js'

/**
 * Leitura e escrita das tabelas. É a única camada que conhece SQL — o resto do
 * programa trabalha com os tipos de `@shared/types`.
 */

/** Nome do paciente interno que recebe as capturas feitas sem paciente escolhido. */
export const SYSTEM_PATIENT_NAME = 'Sem paciente'

const nowIso = (): string => new Date().toISOString()

// --- Conversão das linhas do banco para os tipos do app ---

interface PatientRow {
  id: number
  name: string
  document: string | null
  birth_date: string | null
  notes: string | null
  is_system: number
  created_at: string
  updated_at: string
}

const toPatient = (r: PatientRow): Patient => ({
  id: r.id,
  name: r.name,
  document: r.document,
  birthDate: r.birth_date,
  notes: r.notes,
  isSystem: r.is_system === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

interface ExamRow {
  id: number
  patient_id: number
  title: string
  exam_date: string
  notes: string | null
  folder: string
  created_at: string
}

const toExam = (r: ExamRow): Exam => ({
  id: r.id,
  patientId: r.patient_id,
  title: r.title,
  examDate: r.exam_date,
  notes: r.notes,
  folder: r.folder,
  createdAt: r.created_at
})

interface MediaRow {
  id: number
  exam_id: number
  kind: MediaKind
  file_path: string
  file_name: string
  width: number | null
  height: number | null
  duration_ms: number | null
  bytes: number | null
  annotated_from: number | null
  created_at: string
  drive_file_id: string | null
  drive_status: MediaItem['driveStatus']
}

const toMedia = (r: MediaRow): MediaItem => ({
  id: r.id,
  examId: r.exam_id,
  kind: r.kind,
  filePath: r.file_path,
  fileName: r.file_name,
  width: r.width,
  height: r.height,
  durationMs: r.duration_ms,
  bytes: r.bytes,
  annotatedFrom: r.annotated_from,
  createdAt: r.created_at,
  driveFileId: r.drive_file_id,
  driveStatus: r.drive_status
})

// --- Pacientes ---

export function listPatients(search = ''): Patient[] {
  const term = search.trim()
  const rows = term
    ? queryAll<PatientRow>(
        'SELECT * FROM patients WHERE is_system = 0 AND (name LIKE ? COLLATE NOCASE ' +
          "OR IFNULL(document, '') LIKE ? COLLATE NOCASE) ORDER BY name COLLATE NOCASE",
        `%${term}%`,
        `%${term}%`
      )
    : queryAll<PatientRow>(
        'SELECT * FROM patients WHERE is_system = 0 ORDER BY name COLLATE NOCASE'
      )
  return rows.map(toPatient)
}

export function getPatient(id: number): Patient | null {
  const row = queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', id)
  return row ? toPatient(row) : null
}

export function createPatient(input: {
  name: string
  document?: string | null
  birthDate?: string | null
  notes?: string | null
}): Patient {
  const name = input.name.trim()
  if (!name) throw new Error('O nome do paciente não pode ficar em branco.')

  const at = nowIso()
  const result = getDatabase()
    .prepare(
      'INSERT INTO patients (name, document, birth_date, notes, is_system, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, 0, ?, ?)'
    )
    .run(name, input.document ?? null, input.birthDate ?? null, input.notes ?? null, at, at)

  return getPatient(Number(result.lastInsertRowid))!
}

export function updatePatient(
  id: number,
  patch: {
    name?: string
    document?: string | null
    birthDate?: string | null
    notes?: string | null
  }
): Patient {
  const current = getPatient(id)
  if (!current) throw new Error('Paciente não encontrado.')
  if (current.isSystem) {
    throw new Error('Este registro é do próprio programa e não pode ser editado.')
  }

  const name = patch.name === undefined ? current.name : patch.name.trim()
  if (!name) throw new Error('O nome do paciente não pode ficar em branco.')

  getDatabase()
    .prepare(
      'UPDATE patients SET name = ?, document = ?, birth_date = ?, notes = ?, updated_at = ? WHERE id = ?'
    )
    .run(
      name,
      patch.document === undefined ? current.document : patch.document,
      patch.birthDate === undefined ? current.birthDate : patch.birthDate,
      patch.notes === undefined ? current.notes : patch.notes,
      nowIso(),
      id
    )

  return getPatient(id)!
}

/**
 * Remove um paciente. Só é permitido enquanto ele não tem exames — apagar em
 * cascata levaria junto o registro de fotos que continuam no disco, e ninguém
 * quer descobrir isso depois.
 */
export function deletePatient(id: number): void {
  const patient = getPatient(id)
  if (!patient) return
  if (patient.isSystem) {
    throw new Error('Este registro é do próprio programa e não pode ser excluído.')
  }

  const exams = listExams(id)
  if (exams.length > 0) {
    throw new Error(
      `Este paciente tem ${exams.length} exame(s) registrado(s). ` +
        'Exclua os exames pela galeria antes de remover o paciente.'
    )
  }

  getDatabase().prepare('DELETE FROM patients WHERE id = ?').run(id)
}

/** Paciente interno que recebe as capturas feitas sem paciente escolhido. */
export function ensureSystemPatient(): Patient {
  const existing = queryOne<PatientRow>('SELECT * FROM patients WHERE is_system = 1 LIMIT 1')
  if (existing) return toPatient(existing)

  const at = nowIso()
  const result = getDatabase()
    .prepare('INSERT INTO patients (name, is_system, created_at, updated_at) VALUES (?, 1, ?, ?)')
    .run(SYSTEM_PATIENT_NAME, at, at)
  return getPatient(Number(result.lastInsertRowid))!
}

// --- Exames ---

export function listExams(patientId: number): Exam[] {
  return queryAll<ExamRow>(
    'SELECT * FROM exams WHERE patient_id = ? ORDER BY exam_date DESC, id DESC',
    patientId
  ).map(toExam)
}

export function getExam(id: number): Exam | null {
  const row = queryOne<ExamRow>('SELECT * FROM exams WHERE id = ?', id)
  return row ? toExam(row) : null
}

export function createExam(input: {
  patientId: number
  title?: string
  examDate?: Date
  notes?: string | null
}): Exam {
  const patient = getPatient(input.patientId)
  if (!patient) throw new Error('Paciente não encontrado.')

  const when = input.examDate ?? new Date()
  const title = (input.title ?? '').trim() || 'Exame'

  // A pasta é criada junto com o exame para que a captura nunca falhe por
  // falta de pasta no meio do atendimento.
  const folder = ensureDir(
    join(mediaRoot(), sanitizeName(patient.name, 'Sem_paciente'), examFolderName(when, title))
  )

  const result = getDatabase()
    .prepare(
      'INSERT INTO exams (patient_id, title, exam_date, notes, folder, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(input.patientId, title, formatDate(when), input.notes ?? null, folder, nowIso())

  return getExam(Number(result.lastInsertRowid))!
}

/**
 * Exame "do dia" do paciente interno. Serve de destino para as capturas feitas
 * sem paciente escolhido, para que nenhuma foto fique órfã no disco.
 */
export function ensureLooseExam(): Exam {
  const patient = ensureSystemPatient()
  const today = formatDate(new Date())
  const row = queryOne<ExamRow>(
    'SELECT * FROM exams WHERE patient_id = ? AND exam_date = ? ORDER BY id LIMIT 1',
    patient.id,
    today
  )

  if (row) {
    ensureDir(row.folder)
    return toExam(row)
  }
  return createExam({ patientId: patient.id, title: 'Avulsas' })
}

// --- Mídias ---

export function insertMedia(input: {
  examId: number
  kind: MediaKind
  filePath: string
  fileName: string
  width?: number | null
  height?: number | null
  durationMs?: number | null
  bytes?: number | null
  annotatedFrom?: number | null
}): MediaItem {
  const result = getDatabase()
    .prepare(
      'INSERT INTO media (exam_id, kind, file_path, file_name, width, height, duration_ms, ' +
        'bytes, annotated_from, created_at, drive_status) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')"
    )
    .run(
      input.examId,
      input.kind,
      input.filePath,
      input.fileName,
      input.width ?? null,
      input.height ?? null,
      input.durationMs ?? null,
      input.bytes ?? null,
      input.annotatedFrom ?? null,
      nowIso()
    )

  return getMedia(Number(result.lastInsertRowid))!
}

export function getMedia(id: number): MediaItem | null {
  const row = queryOne<MediaRow>('SELECT * FROM media WHERE id = ?', id)
  return row ? toMedia(row) : null
}

export function listMedia(examId: number): MediaItem[] {
  return queryAll<MediaRow>(
    'SELECT * FROM media WHERE exam_id = ? ORDER BY created_at DESC, id DESC',
    examId
  ).map(toMedia)
}

/** Remove o registro da mídia. O arquivo em disco é apagado à parte. */
export function deleteMediaRow(id: number): void {
  getDatabase().prepare('DELETE FROM media WHERE id = ?').run(id)
}

/** Todos os exames, do mais recente para o mais antigo, com o nome do paciente. */
export function listAllExams(): Array<Exam & { patientName: string; isSystem: boolean }> {
  const rows = queryAll<ExamRow & { patient_name: string; is_system: number }>(
    'SELECT e.*, p.name AS patient_name, p.is_system FROM exams e ' +
      'JOIN patients p ON p.id = e.patient_id ORDER BY e.exam_date DESC, e.id DESC'
  )
  return rows.map((row) => ({
    ...toExam(row),
    patientName: row.patient_name,
    isSystem: row.is_system === 1
  }))
}

/** Quantas fotos e vídeos cada exame do paciente já tem. */
export function examMediaCounts(patientId: number): Record<number, { photos: number; videos: number }> {
  const rows = queryAll<{ exam_id: number; kind: MediaKind; total: number }>(
    'SELECT m.exam_id, m.kind, COUNT(*) AS total FROM media m ' +
      'JOIN exams e ON e.id = m.exam_id WHERE e.patient_id = ? GROUP BY m.exam_id, m.kind',
    patientId
  )

  const counts: Record<number, { photos: number; videos: number }> = {}
  for (const row of rows) {
    const entry = (counts[row.exam_id] ??= { photos: 0, videos: 0 })
    if (row.kind === 'video') entry.videos += row.total
    else entry.photos += row.total
  }
  return counts
}

/** Últimas capturas de todos os exames — usada pelo painel de capturas da tela principal. */
export function listRecentMedia(limit = 24): MediaItem[] {
  return queryAll<MediaRow>(
    'SELECT * FROM media ORDER BY created_at DESC, id DESC LIMIT ?',
    limit
  ).map(toMedia)
}
