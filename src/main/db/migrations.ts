/**
 * Migrações do banco.
 *
 * Cada item do array é uma versão. O banco guarda em qual versão está
 * (`PRAGMA user_version`) e, ao abrir, aplica só o que falta. Nunca edite uma
 * migração já publicada — acrescente uma nova no fim do array.
 */
export const MIGRATIONS: string[] = [
  // v1 — estrutura inicial
  `
  CREATE TABLE patients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    document    TEXT,
    birth_date  TEXT,
    notes       TEXT,
    -- 1 = registro criado pelo próprio programa ("Sem paciente"), que recebe as
    -- capturas avulsas. Não aparece na lista de pacientes nem pode ser apagado.
    is_system   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE INDEX idx_patients_name ON patients (name COLLATE NOCASE);

  CREATE TABLE exams (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  INTEGER NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    exam_date   TEXT    NOT NULL,
    notes       TEXT,
    folder      TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
  );
  CREATE INDEX idx_exams_patient ON exams (patient_id, exam_date DESC);

  CREATE TABLE media (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id        INTEGER NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    kind           TEXT    NOT NULL CHECK (kind IN ('photo', 'video', 'report')),
    file_path      TEXT    NOT NULL,
    file_name      TEXT    NOT NULL,
    width          INTEGER,
    height         INTEGER,
    duration_ms    INTEGER,
    bytes          INTEGER,
    annotated_from INTEGER REFERENCES media (id) ON DELETE SET NULL,
    created_at     TEXT    NOT NULL,
    drive_file_id  TEXT,
    drive_status   TEXT    NOT NULL DEFAULT 'local'
                   CHECK (drive_status IN ('local','pending','uploading','uploaded','error'))
  );
  CREATE INDEX idx_media_exam ON media (exam_id, created_at DESC);
  CREATE INDEX idx_media_drive ON media (drive_status);

  CREATE TABLE upload_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id        INTEGER NOT NULL UNIQUE REFERENCES media (id) ON DELETE CASCADE,
    state           TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','uploading','done','error')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error      TEXT,
    session_uri     TEXT,
    bytes_sent      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL
  );
  CREATE INDEX idx_queue_ready ON upload_queue (state, next_attempt_at);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE shortcuts (
    action      TEXT PRIMARY KEY,
    accelerator TEXT    NOT NULL,
    is_global   INTEGER NOT NULL DEFAULT 0
  );
  `,

  // v2 — ajustes de imagem salvos por câmera
  `
  CREATE TABLE camera_presets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Nome dado pelo usuário ("Objetiva 40x"). Vazio identifica a linha que o
    -- programa mantém sozinho com o último ajuste usado naquela câmera.
    name         TEXT    NOT NULL,
    camera_label TEXT    NOT NULL DEFAULT '',
    data         TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX idx_presets_unique
    ON camera_presets (camera_label, name COLLATE NOCASE);
  `
]
