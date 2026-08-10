import type { Exam, Patient } from '@shared/types'
import { ensureLooseExam, getExam, getPatient } from './db/repos.js'
import { ensureDir } from './paths.js'

/**
 * Qual paciente/exame está recebendo as capturas neste momento.
 *
 * Fica no processo principal, e não na interface, porque quem decide onde o
 * arquivo é gravado é quem grava. Sem exame escolhido, as capturas caem no
 * exame "Avulsas" do dia — nada fica solto no disco.
 */

let activeExamId: number | null = null

export interface CaptureContext {
  exam: Exam
  patient: Patient
}

export function setActiveExam(examId: number | null): CaptureContext {
  if (examId !== null && !getExam(examId)) {
    throw new Error('Exame não encontrado.')
  }
  activeExamId = examId
  return captureContext()
}

export function getActiveExamId(): number | null {
  return activeExamId
}

/** Exame e paciente de destino, criando o exame avulso do dia se preciso. */
export function captureContext(): CaptureContext {
  const exam = (activeExamId !== null ? getExam(activeExamId) : null) ?? ensureLooseExam()

  // Se o usuário renomeou ou apagou a pasta pelo Explorer, recriamos antes de
  // tentar gravar — o atendimento não pode parar por causa disso.
  ensureDir(exam.folder)

  const patient = getPatient(exam.patientId)
  if (!patient) throw new Error('O paciente deste exame não existe mais.')

  return { exam, patient }
}

/** Nome usado no arquivo: em branco para o paciente interno. */
export function captureNameBase(context: CaptureContext): string {
  return context.patient.isSystem ? 'Microazz' : context.patient.name
}
