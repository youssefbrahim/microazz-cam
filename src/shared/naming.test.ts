import { describe, expect, it } from 'vitest'
import {
  captureFileName,
  examFolderName,
  formatDate,
  formatTimestamp,
  sanitizeName,
  withCopyIndex
} from './naming'

describe('sanitizeName', () => {
  it('mantém acentos, que o Windows aceita', () => {
    expect(sanitizeName('Conceição Araújo')).toBe('Conceição_Araújo')
  })

  it('troca símbolos proibidos por sublinhado', () => {
    expect(sanitizeName('Maria / Silva: 2º exame')).toBe('Maria_Silva_2º_exame')
  })

  it('não deixa sublinhados repetidos nem nas pontas', () => {
    expect(sanitizeName('  ...José   //  Alves ... ')).toBe('José_Alves')
  })

  it('usa o padrão quando sobra vazio', () => {
    expect(sanitizeName('///', 'Sem_nome')).toBe('Sem_nome')
    expect(sanitizeName('', 'Microazz')).toBe('Microazz')
  })

  it('escapa os nomes que o Windows reserva', () => {
    expect(sanitizeName('CON')).toBe('_CON')
    expect(sanitizeName('lpt1')).toBe('_lpt1')
  })

  it('limita o tamanho para não estourar o caminho do Windows', () => {
    expect(sanitizeName('a'.repeat(200))).toHaveLength(80)
  })
})

describe('datas', () => {
  const when = new Date(2026, 7, 10, 14, 32, 5) // 10/08/2026 14:32:05, hora local

  it('formata a data da pasta', () => {
    expect(formatDate(when)).toBe('2026-08-10')
  })

  it('formata o carimbo do arquivo', () => {
    expect(formatTimestamp(when)).toBe('2026-08-10_14-32-05')
  })

  it('monta o nome da pasta do exame', () => {
    expect(examFolderName(when, 'Biópsia de pele')).toBe('2026-08-10 Biópsia_de_pele')
  })

  it('usa "Exame" quando o título vem vazio', () => {
    expect(examFolderName(when, '   ')).toBe('2026-08-10 Exame')
  })
})

describe('captureFileName', () => {
  const when = new Date(2026, 7, 10, 14, 32, 5)

  it('junta paciente, data e extensão', () => {
    expect(captureFileName('Maria Silva', 'jpg', when)).toBe('Maria_Silva_2026-08-10_14-32-05.jpg')
  })

  it('aceita a extensão com ponto e normaliza para minúsculas', () => {
    expect(captureFileName('Maria', '.MP4', when)).toBe('Maria_2026-08-10_14-32-05.mp4')
  })

  it('acrescenta o sufixo antes da extensão', () => {
    expect(captureFileName('Maria', 'jpg', when, '_anotada')).toBe(
      'Maria_2026-08-10_14-32-05_anotada.jpg'
    )
  })

  it('cai para Microazz quando não há paciente', () => {
    expect(captureFileName('', 'jpg', when)).toBe('Microazz_2026-08-10_14-32-05.jpg')
  })
})

describe('withCopyIndex', () => {
  it('não mexe no primeiro arquivo', () => {
    expect(withCopyIndex('foto.jpg', 1)).toBe('foto.jpg')
  })

  it('numera as colisões antes da extensão', () => {
    expect(withCopyIndex('foto.jpg', 2)).toBe('foto (2).jpg')
    expect(withCopyIndex('Maria_2026-08-10_14-32-05.mp4', 3)).toBe(
      'Maria_2026-08-10_14-32-05 (3).mp4'
    )
  })

  it('lida com nome sem extensão', () => {
    expect(withCopyIndex('semextensao', 2)).toBe('semextensao (2)')
  })
})
