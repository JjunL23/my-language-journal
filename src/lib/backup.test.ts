import { describe, expect, it } from 'vitest'
import { createBackup, MAX_BACKUP_BYTES, MAX_BACKUP_ENTRIES, parseBackup, previewImport, previewReplacement } from './backup'
import { FIELD_LIMITS, type Entry } from './entries'

const entry: Entry = {
  id: 'entry-one', type: 'word', english: 'Improve', chinese: '改善、提升', malay: 'Meningkatkan', note: 'Several meanings are welcome.', favorite: true,
  createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z',
}
const serialized = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...createBackup([entry]), ...overrides })

describe('JSON backup round trip', () => {
  it('preserves every field, Unicode, favorite, ID, and timestamps', () => {
    const chunk = { ...entry, id: 'entry-two', type: 'chunk' as const, english: '', chinese: '慢慢来', note: 'Line one\nLine two' }
    const backup = createBackup([entry, chunk])
    expect(backup).toMatchObject({ app: 'my-language-journal', version: 1 })
    expect(parseBackup(JSON.stringify(backup, null, 2))).toEqual([entry, chunk])
    backup.entries[0].english = 'Changed copy'
    expect(entry.english).toBe('Improve')
  })

  it('allows an empty backup and an optional UTF-8 byte-order mark', () => {
    expect(parseBackup(JSON.stringify(createBackup([])))).toEqual([])
    expect(parseBackup('\uFEFF' + serialized())).toEqual([entry])
  })

  it.each(['not JSON', '{', 'null', '[]', '42'])(
    'rejects a malformed or unversioned document: %s', (text) => expect(() => parseBackup(text)).toThrow(),
  )

  it('rejects the wrong application, unsupported versions, unknown fields, and invalid export dates', () => {
    expect(() => parseBackup(serialized({ app: 'another-app' }))).toThrow(/not a My Language Journal/)
    expect(() => parseBackup(serialized({ version: 2 }))).toThrow(/version is not supported/)
    expect(() => parseBackup(serialized({ version: '1' }))).toThrow(/version is not supported/)
    expect(() => parseBackup(serialized({ unexpected: true }))).toThrow(/unsupported fields/)
    expect(() => parseBackup(serialized({ exportedAt: 'yesterday' }))).toThrow(/export date/)
    expect(() => parseBackup(serialized({ entries: {} }))).toThrow(/entries array/)
  })

  it.each([
    { type: 'sentence' }, { id: '' }, { id: ' id ' }, { id: 'x'.repeat(129) },
    { english: '', chinese: '\n', malay: ' ' }, { chinese: null }, { favorite: 'true' },
    { note: 7 }, { createdAt: '2026-02-30T10:00:00Z' }, { updatedAt: 'invalid' },
    { note: 'x'.repeat(FIELD_LIMITS.note + 1) }, { extra: 'unsupported' },
  ])('rejects invalid entry fields before importing (%#)', (overrides) => {
    expect(() => parseBackup(serialized({ entries: [{ ...entry, ...overrides }] }))).toThrow(/Entry 1:/)
  })

  it('rejects missing required fields and duplicate IDs', () => {
    const { note: _note, ...withoutNote } = entry
    expect(() => parseBackup(serialized({ entries: [withoutNote] }))).toThrow(/Notes must be text/)
    expect(() => parseBackup(serialized({ entries: [entry, { ...entry, english: 'Another value' }] }))).toThrow(/duplicate ID/)
  })

  it('checks actual UTF-8 bytes, rather than only JavaScript character count', () => {
    expect(() => parseBackup('中'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3)))).toThrow(/too large/)
  })

  it('rejects a compact backup that would exceed the supported export size', () => {
    const large = { ...entry, id: 'large-0000', note: 'x'.repeat(FIELD_LIMITS.note) }
    const envelope = (entries: Entry[]) => ({ app: 'my-language-journal', version: 1, exportedAt: '2026-10-26T10:00:00.000Z', entries })
    const bytes = (entries: Entry[]) => new TextEncoder().encode(JSON.stringify(envelope(entries), null, 2)).byteLength
    const oneSize = bytes([large])
    const increment = bytes([large, { ...large, id: 'large-0001' }]) - oneSize
    const count = Math.floor((MAX_BACKUP_BYTES - oneSize) / increment) + 2
    const entries = Array.from({ length: count }, (_, index) => ({ ...large, id: `large-${index.toString().padStart(4, '0')}` }))
    const compact = JSON.stringify(envelope(entries))
    expect(new TextEncoder().encode(compact).byteLength).toBeLessThan(MAX_BACKUP_BYTES)
    expect(() => parseBackup(compact)).toThrow(/standard export format/)
  })

  it('enforces the entry count limit before constructing an export', () => {
    expect(() => createBackup(Array(MAX_BACKUP_ENTRIES + 1).fill(entry))).toThrow(/50,000/)
  })
})

describe('import preview', () => {
  it('counts new, changed, and identical IDs independently of object property order', () => {
    const second = { ...entry, id: 'second' }
    const reordered = Object.fromEntries(Object.entries(entry).reverse()) as unknown as Entry
    expect(previewImport([entry, second], [reordered, { ...second, favorite: false }, { ...entry, id: 'third' }])).toEqual({ added: 1, updated: 1, unchanged: 1 })
  })

  it('does not count unmentioned existing records as deletions or updates', () => {
    expect(previewImport([entry], [])).toEqual({ added: 0, updated: 0, unchanged: 0 })
    expect(previewImport([], [entry])).toEqual({ added: 1, updated: 0, unchanged: 0 })
  })
})

describe('replacement preview', () => {
  it('reports changes, removals, and the final incoming total', () => {
    const changed = { ...entry, id: 'changed' }
    const removed = { ...entry, id: 'removed' }
    const incoming = [entry, { ...changed, favorite: false }, { ...entry, id: 'added' }]
    expect(previewReplacement([entry, changed, removed], incoming)).toEqual({ added: 1, updated: 1, unchanged: 1, removed: 1, total: 3 })
  })

  it('shows that an empty replacement removes every current entry', () => {
    expect(previewReplacement([entry], [])).toEqual({ added: 0, updated: 0, unchanged: 0, removed: 1, total: 0 })
    expect(previewReplacement([], [entry])).toEqual({ added: 1, updated: 0, unchanged: 0, removed: 0, total: 1 })
    expect(previewReplacement([entry], [entry])).toEqual({ added: 0, updated: 0, unchanged: 1, removed: 0, total: 1 })
  })
})
