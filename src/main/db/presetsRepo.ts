import type { CameraPreset, CameraPresetData } from '@shared/types'
import { getDatabase, queryAll, queryOne } from './connection.js'
import { log } from '../log.js'

/**
 * Ajustes de imagem salvos por câmera.
 *
 * A linha de nome vazio é mantida pelo próprio programa: guarda o último ajuste
 * usado em cada câmera, para que ao abrir o Microazz Cam de novo a imagem volte
 * exatamente como estava. As linhas com nome são as predefinições que o usuário
 * cria ("Objetiva 10x", "Objetiva 40x").
 */

const AUTO_NAME = ''

interface PresetRow {
  id: number
  name: string
  camera_label: string
  data: string
  updated_at: string
}

function toPreset(row: PresetRow): CameraPreset | null {
  try {
    return {
      id: row.id,
      name: row.name,
      cameraLabel: row.camera_label,
      data: JSON.parse(row.data) as CameraPresetData,
      updatedAt: row.updated_at
    }
  } catch {
    log.warn('predefinição ilegível foi ignorada', { id: row.id })
    return null
  }
}

/** Predefinições com nome, da câmera indicada. */
export function listPresets(cameraLabel: string): CameraPreset[] {
  return queryAll<PresetRow>(
    "SELECT * FROM camera_presets WHERE camera_label = ? AND name <> '' ORDER BY name COLLATE NOCASE",
    cameraLabel
  )
    .map(toPreset)
    .filter((p): p is CameraPreset => p !== null)
}

/** Último ajuste usado nesta câmera, se houver. */
export function readAutoPreset(cameraLabel: string): CameraPreset | null {
  const row = queryOne<PresetRow>(
    'SELECT * FROM camera_presets WHERE camera_label = ? AND name = ?',
    cameraLabel,
    AUTO_NAME
  )
  return row ? toPreset(row) : null
}

export function savePreset(
  cameraLabel: string,
  name: string,
  data: CameraPresetData
): CameraPreset {
  const cleanName = name.trim()
  const at = new Date().toISOString()

  getDatabase()
    .prepare(
      'INSERT INTO camera_presets (name, camera_label, data, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT (camera_label, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    )
    .run(cleanName, cameraLabel, JSON.stringify(data), at, at)

  const saved =
    cleanName === AUTO_NAME
      ? readAutoPreset(cameraLabel)
      : listPresets(cameraLabel).find((p) => p.name.toLowerCase() === cleanName.toLowerCase()) ??
        null

  if (!saved) throw new Error('Não foi possível salvar a predefinição.')
  return saved
}

export function deletePreset(id: number): void {
  getDatabase().prepare("DELETE FROM camera_presets WHERE id = ? AND name <> ''").run(id)
}
