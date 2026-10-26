export type EntryType = 'word' | 'chunk'

export interface EntryDraft {
  type: EntryType
  english: string
  chinese: string
  malay: string
  note: string
}

export interface Entry extends EntryDraft {
  id: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export const FIELD_LIMITS = {
  english: 5_000,
  chinese: 5_000,
  malay: 5_000,
  note: 20_000,
} as const

const languageFields = ['english', 'chinese', 'malay'] as const
const textFields = [...languageFields, 'note'] as const
const fieldLabels = {
  english: 'English',
  chinese: 'Chinese',
  malay: 'Bahasa Melayu',
  note: 'Notes',
} as const

export function validateDraft(draft: EntryDraft): string | null {
  if (!draft || (draft.type !== 'word' && draft.type !== 'chunk')) {
    return 'Choose Word or Chunk.'
  }

  for (const field of textFields) {
    if (typeof draft[field] !== 'string') return `${fieldLabels[field]} must be text.`
    if (draft[field].length > FIELD_LIMITS[field]) {
      return `${fieldLabels[field]} must be ${FIELD_LIMITS[field].toLocaleString('en-US')} characters or fewer.`
    }
  }

  if (!languageFields.some((field) => draft[field].trim().length > 0)) {
    return 'Add at least one language before saving.'
  }
  return null
}

function cleanDraft(draft: EntryDraft): EntryDraft {
  const error = validateDraft(draft)
  if (error) throw new Error(error)
  return {
    type: draft.type,
    english: draft.english.trim(),
    chinese: draft.chinese.trim(),
    malay: draft.malay.trim(),
    note: draft.note.trim(),
  }
}

export function createEntry(draft: EntryDraft): Entry {
  const clean = cleanDraft(draft)
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    ...clean,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateEntry(entry: Entry, draft: EntryDraft): Entry {
  return {
    ...entry,
    ...cleanDraft(draft),
    updatedAt: new Date().toISOString(),
  }
}

export function matchesSearch(entry: Entry, query: string): boolean {
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase('en-US')
  if (!normalized) return true
  return languageFields.some((field) =>
    entry[field].normalize('NFKC').toLocaleLowerCase('en-US').includes(normalized),
  )
}

/** Exact content duplicates only; partial translations and record types differ. */
export function findDuplicateEntries(entries: Entry[], draft: EntryDraft, excludeId?: string): Entry[] {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
  const normalized = languageFields.map((field) => normalize(draft[field]))
  if (!normalized.some(Boolean)) return []
  return entries.filter((entry) =>
    entry.id !== excludeId && entry.type === draft.type && languageFields.every((field, index) => normalize(entry[field]) === normalized[index]),
  )
}

/** A date-time with seconds and an explicit timezone, with calendar validation. */
export function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!parts) return false
  const [, year, month, day, hour, minute, second, timezone, offsetHour, offsetMinute] = parts
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const daysInMonth = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth[m - 1]) return false
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false
  if (timezone !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false
  return Number.isFinite(Date.parse(value))
}

const entryKeys = ['id', 'type', 'english', 'chinese', 'malay', 'note', 'favorite', 'createdAt', 'updatedAt'] as const

/** Validate at the persistence boundary as well as at the import boundary. */
export function assertEntry(value: unknown): asserts value is Entry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each entry must be an object.')
  }
  const entry = value as Record<string, unknown>
  if (Object.keys(entry).some((key) => !entryKeys.includes(key as typeof entryKeys[number]))) {
    throw new Error('An entry contains unsupported fields.')
  }
  if (typeof entry.id !== 'string' || entry.id.trim() !== entry.id || entry.id.length === 0 || entry.id.length > 128 || /[\u0000-\u001f\u007f]/.test(entry.id)) {
    throw new Error('Each entry needs a valid, unique ID of 128 characters or fewer.')
  }
  const draftError = validateDraft(value as EntryDraft)
  if (draftError) throw new Error(draftError)
  if (typeof entry.favorite !== 'boolean') throw new Error('Favorite must be true or false.')
  if (!isValidTimestamp(entry.createdAt) || !isValidTimestamp(entry.updatedAt)) {
    throw new Error('Entry dates must be valid ISO date-times with a timezone.')
  }
}

export function entriesEqual(a: Entry, b: Entry): boolean {
  return entryKeys.every((key) => a[key] === b[key])
}
