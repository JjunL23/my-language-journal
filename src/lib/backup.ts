import { assertEntry, entriesEqual, isValidTimestamp, type Entry } from './entries'

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024
export const MAX_BACKUP_ENTRIES = 50_000

export class BackupCapacityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupCapacityError'
  }
}

export interface BackupV1 {
  app: 'my-language-journal'
  version: 1
  exportedAt: string
  entries: Entry[]
}

export interface ImportPreview {
  added: number
  updated: number
  unchanged: number
}

export interface ReplacementPreview extends ImportPreview {
  removed: number
  total: number
}

function validatedEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) throw new Error('The backup must contain an entries array.')
  if (value.length > MAX_BACKUP_ENTRIES) throw new BackupCapacityError('This backup has too many entries. The limit is 50,000.')
  const ids = new Set<string>()
  return value.map((entry: unknown, index: number) => {
    try {
      assertEntry(entry)
      if (ids.has(entry.id)) throw new Error('The backup contains a duplicate ID.')
      ids.add(entry.id)
      return { ...entry }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid entry.'
      throw new Error(`Entry ${index + 1}: ${message}`)
    }
  })
}

export function createBackup(entries: Entry[]): BackupV1 {
  const backup: BackupV1 = {
    app: 'my-language-journal',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: validatedEntries(entries),
  }
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > MAX_BACKUP_BYTES) {
    throw new BackupCapacityError('This journal exceeds the 10 MB backup limit. No backup was created.')
  }
  return backup
}

export function parseBackup(text: string): Entry[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('This backup is too large. Choose a JSON file smaller than 10 MB.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('This file is not valid JSON. Choose a backup exported from My Language Journal.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Choose a versioned backup exported from My Language Journal.')
  }
  const backup = parsed as Record<string, unknown>
  if (backup.app !== 'my-language-journal') throw new Error('This file is not a My Language Journal backup.')
  if (backup.version !== 1) throw new Error('This backup version is not supported. Expected version 1.')
  if (Object.keys(backup).some((key) => !['app', 'version', 'exportedAt', 'entries'].includes(key))) {
    throw new Error('This backup contains unsupported fields.')
  }
  if (!isValidTimestamp(backup.exportedAt)) throw new Error('The backup export date is invalid.')
  const entries = validatedEntries(backup.entries)
  // Compact or differently formatted inputs must also fit the application's
  // normal export format, so importing never makes a journal unrestorable.
  try {
    createBackup(entries)
  } catch (error) {
    if (error instanceof BackupCapacityError) {
      throw new BackupCapacityError('This backup exceeds the 10 MB journal limit in the standard export format. No entries were imported.')
    }
    throw error
  }
  return entries
}

export function previewImport(current: Entry[], incoming: Entry[]): ImportPreview {
  const existing = new Map(current.map((entry) => [entry.id, entry]))
  const preview = { added: 0, updated: 0, unchanged: 0 }
  for (const entry of incoming) {
    const prior = existing.get(entry.id)
    if (!prior) preview.added += 1
    else if (entriesEqual(prior, entry)) preview.unchanged += 1
    else preview.updated += 1
  }
  return preview
}

export function previewReplacement(current: Entry[], incoming: Entry[]): ReplacementPreview {
  const incomingIds = new Set(incoming.map((entry) => entry.id))
  return {
    ...previewImport(current, incoming),
    removed: current.filter((entry) => !incomingIds.has(entry.id)).length,
    total: incoming.length,
  }
}
