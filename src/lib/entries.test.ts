import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertEntry, createEntry, FIELD_LIMITS, findDuplicateEntries, isValidTimestamp, matchesSearch, updateEntry, validateDraft, type EntryDraft } from './entries'

const draft: EntryDraft = {
  type: 'word', english: 'Improve', chinese: '改善、提升', malay: 'Meningkatkan', note: '',
}

afterEach(() => vi.useRealTimers())

describe('entries', () => {
  it('requires one non-blank language but allows the other translations to be added later', () => {
    expect(validateDraft({ ...draft, english: '  ', chinese: '\n', malay: '\t' })).toMatch(/at least one language/)
    expect(validateDraft({ ...draft, english: '', chinese: '改善', malay: '' })).toBeNull()
    expect(validateDraft({ ...draft, english: '', chinese: '', malay: 'Baik' })).toBeNull()
  })

  it('enforces the supported record types and field limits', () => {
    expect(validateDraft({ ...draft, type: 'sentence' as EntryDraft['type'] })).toMatch(/Word or Chunk/)
    expect(validateDraft({ ...draft, note: 'x'.repeat(FIELD_LIMITS.note + 1) })).toMatch(/20,000/)
    expect(validateDraft({ ...draft, english: 4 as unknown as string })).toMatch(/must be text/)
    expect(() => createEntry({ ...draft, english: '', chinese: '', malay: '' })).toThrow(/at least one/)
  })

  it('creates independent records with trimmed values and matching creation/update dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
    const entry = createEntry({ ...draft, english: ' Improve ', note: ' Use in context.\n' })
    expect(entry).toMatchObject({ english: 'Improve', note: 'Use in context.', favorite: false, createdAt: '2026-10-26T10:00:00.000Z', updatedAt: '2026-10-26T10:00:00.000Z' })
    expect(createEntry(draft).id).not.toBe(entry.id)
    expect(() => assertEntry(entry)).not.toThrow()
  })

  it('edits in place while preserving ID, creation date, and favorite', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T10:00:00Z'))
    const original = { ...createEntry(draft), favorite: true }
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'))
    const edited = updateEntry(original, { ...draft, type: 'chunk', english: 'Make progress' })
    expect(edited).toMatchObject({ id: original.id, createdAt: original.createdAt, favorite: true, updatedAt: '2026-10-27T10:00:00.000Z', type: 'chunk', english: 'Make progress' })
    expect(original.english).toBe('Improve')
  })

  it('finds all three languages case-insensitively, including normalized Unicode', () => {
    const entry = createEntry(draft)
    expect(matchesSearch(entry, ' IMPROVE ')).toBe(true)
    expect(matchesSearch(entry, '提升')).toBe(true)
    expect(matchesSearch(entry, 'MENINGKAT')).toBe(true)
    expect(matchesSearch(entry, 'Ｉｍｐｒｏｖｅ')).toBe(true)
    expect(matchesSearch(entry, 'unrelated')).toBe(false)
    expect(matchesSearch(entry, '   ')).toBe(true)
    expect(matchesSearch({ ...entry, note: 'only in a note' }, 'only in a note')).toBe(false)
  })
})

describe('timestamp validation', () => {
  it.each(['2026-10-26T10:00:00Z', '2026-10-26T10:00:00.123Z', '2024-02-29T00:00:00+08:00'])(
    'accepts a valid timestamp: %s', (timestamp) => expect(isValidTimestamp(timestamp)).toBe(true),
  )
  it.each(['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-10-26', '2026-10-26T24:00:00Z', '2026-10-26T10:00:60Z', '2026-10-26T10:00:00+99:00', 'not a date', null])(
    'rejects an invalid timestamp: %s', (timestamp) => expect(isValidTimestamp(timestamp)).toBe(false),
  )
})

describe('duplicate content detection', () => {
  it('matches normalized casing, surrounding whitespace, and all three language fields', () => {
    const original = createEntry(draft)
    const equivalent = { ...draft, english: ' ＩＭＰＲＯＶＥ ', chinese: '\n改善、提升　', malay: ' MENINGKATKAN\t', note: 'Different notes' }
    expect(findDuplicateEntries([{ ...original, favorite: true }], equivalent)).toHaveLength(1)
    expect(original.english).toBe('Improve')
  })

  it('treats canonically equivalent Unicode as the same content', () => {
    const original = createEntry({ ...draft, english: 'café' })
    expect(findDuplicateEntries([original], { ...draft, english: 'CAFE\u0301' })).toEqual([original])
  })

  it('requires the same type and all language values, preserving meaningful internal spacing', () => {
    const original = createEntry({ ...draft, english: 'take care' })
    expect(findDuplicateEntries([original], { ...draft, english: 'take care', type: 'chunk' })).toEqual([])
    expect(findDuplicateEntries([original], { ...draft, english: 'take care', malay: '' })).toEqual([])
    expect(findDuplicateEntries([original], { ...draft, english: 'take  care' })).toEqual([])
  })

  it('supports one-language entries but never flags an entirely blank draft', () => {
    const oneLanguage = { ...draft, english: '', chinese: '改善', malay: '' }
    const original = createEntry(oneLanguage)
    expect(findDuplicateEntries([original], { ...oneLanguage, chinese: ' 改善 ' })).toEqual([original])
    expect(findDuplicateEntries([original], { ...draft, english: ' ', chinese: '\n', malay: '　' })).toEqual([])
  })

  it('excludes the edited record while reporting other exact duplicates', () => {
    const original = createEntry(draft)
    const other = createEntry(draft)
    expect(findDuplicateEntries([original, other], draft, original.id)).toEqual([other])
    expect(findDuplicateEntries([original], draft, original.id)).toEqual([])
  })
})
