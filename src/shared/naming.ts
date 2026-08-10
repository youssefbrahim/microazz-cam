/**
 * Regras de nome de pasta e de arquivo.
 *
 * Porte da lógica de `microvision/src/lib/naming.ts` (mobile), com duas
 * diferenças: a data vai legível no nome (em vez do número de milissegundos) e
 * a sanitização também cobre os nomes proibidos do Windows.
 */

/** Nomes que o Windows reserva e não aceita como nome de arquivo/pasta. */
const RESERVED_WINDOWS_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

/**
 * Transforma um texto livre (nome de paciente, título de exame) em algo seguro
 * para virar nome de pasta ou de arquivo. Acentos são preservados — o Windows
 * aceita — mas espaços e símbolos viram `_`.
 */
export function sanitizeName(input: string, fallback = 'Sem_nome'): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')

  if (!cleaned) return fallback

  const withoutReserved = RESERVED_WINDOWS_NAMES.has(cleaned.toUpperCase())
    ? `_${cleaned}`
    : cleaned

  // Caminho no Windows tem limite prático; 80 caracteres por segmento é folgado
  // e ainda deixa o nome legível.
  return withoutReserved.slice(0, 80)
}

/** `2026-08-10` — usado no nome da pasta do exame. */
export function formatDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `2026-08-10` vira `10/08/2026`, o formato que o usuário lê. */
export function formatDateBr(iso: string): string {
  const [year, month, day] = iso.split('-')
  return day && month && year ? `${day}/${month}/${year}` : iso
}

/** `2026-08-10_14-32-05` — usado no nome do arquivo. */
export function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

/** Nome da pasta de um exame: `2026-08-10 Biopsia`. */
export function examFolderName(examDate: Date, title: string): string {
  const safeTitle = sanitizeName(title, 'Exame')
  return `${formatDate(examDate)} ${safeTitle}`
}

/**
 * Nome do arquivo de uma captura: `Maria_Silva_2026-08-10_14-32-05.jpg`.
 * Sem paciente, cai para `Microazz_...`.
 */
export function captureFileName(
  patientName: string,
  extension: string,
  when: Date,
  suffix = ''
): string {
  const base = sanitizeName(patientName, 'Microazz')
  const ext = extension.replace(/^\./, '').toLowerCase()
  return `${base}_${formatTimestamp(when)}${suffix}.${ext}`
}

/**
 * Acrescenta ` (2)`, ` (3)`… antes da extensão. Usado quando duas capturas
 * caem no mesmo segundo e o nome colidiria.
 */
export function withCopyIndex(fileName: string, index: number): string {
  if (index <= 1) return fileName
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} (${index})`
  return `${fileName.slice(0, dot)} (${index})${fileName.slice(dot)}`
}
