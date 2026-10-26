import { IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from './entries'
import { createBackup, MAX_BACKUP_BYTES, parseBackup } from './backup'

const entry: Entry = {
  id: 'entry-one', type: 'word', english: 'Improve', chinese: '改善、提升', malay: 'Meningkatkan', note: '', favorite: false,
  createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z',
}

function entriesNearCapacity(): Entry[] {
  const large = { ...entry, id: 'large-0000', note: '界'.repeat(20_000) }
  const bytes = (entries: Entry[]) => new TextEncoder().encode(JSON.stringify(createBackup(entries), null, 2)).byteLength
  const firstSize = bytes([large])
  const addedSize = bytes([large, { ...large, id: 'large-0001' }]) - firstSize
  const count = Math.floor((MAX_BACKUP_BYTES - firstSize) / addedSize) + 1
  return Array.from({ length: count }, (_, index) => ({ ...large, id: `large-${index.toString().padStart(4, '0')}` }))
}

let storage: typeof import('./storage')

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  storage = await import('./storage')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('IndexedDB journal storage', () => {
  it('starts empty, persists records, and reads them through a newly opened connection', async () => {
    expect(await storage.listEntries()).toEqual([])
    await storage.saveEntry(entry)
    vi.resetModules()
    const reopened = await import('./storage')
    expect(await reopened.listEntries()).toEqual([entry])
  })

  it('updates and favorites the same ID without duplicating records', async () => {
    await storage.saveEntry(entry)
    const updated = { ...entry, english: 'Improved', favorite: true, updatedAt: '2026-10-27T10:00:00Z' }
    await storage.saveEntry(updated)
    expect(await storage.listEntries()).toEqual([updated])
  })

  it('sorts by the last update and deletes only the selected record', async () => {
    const second = { ...entry, id: 'second', updatedAt: '2026-10-27T10:00:00Z' }
    await storage.mergeEntries([entry, second])
    expect((await storage.listEntries()).map((item) => item.id)).toEqual(['second', 'entry-one'])
    await storage.deleteEntry('second')
    expect(await storage.listEntries()).toEqual([entry])
  })

  it('merges by ID and preserves records absent from the backup', async () => {
    const untouched = { ...entry, id: 'untouched' }
    await storage.mergeEntries([entry, untouched])
    const changed = { ...entry, english: 'Make progress', type: 'chunk' as const }
    const added = { ...entry, id: 'new' }
    await storage.mergeEntries([changed, added])
    expect(await storage.listEntries()).toEqual(expect.arrayContaining([changed, added, untouched]))
    expect(await storage.listEntries()).toHaveLength(3)
  })

  it('rejects a whole invalid batch without applying its valid entries', async () => {
    await storage.saveEntry(entry)
    await expect(storage.mergeEntries([{ ...entry, english: 'Should not be written' }, { ...entry, id: 'bad', type: 'sentence' as Entry['type'] }])).rejects.toThrow(/Word or Chunk/)
    expect(await storage.listEntries()).toEqual([entry])
    await expect(storage.mergeEntries([entry, entry])).rejects.toThrow(/duplicate/)
  })

  it('rolls back earlier writes when a later write fails', async () => {
    await storage.saveEntry(entry)
    const nativePut = FakeIDBObjectStore.prototype.put
    let writes = 0
    vi.spyOn(FakeIDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      writes += 1
      if (writes === 2) throw new DOMException('Storage full', 'QuotaExceededError')
      return nativePut.call(this, value, key)
    })
    await expect(storage.mergeEntries([{ ...entry, english: 'Should roll back' }, { ...entry, id: 'new' }])).rejects.toThrow(/storage is full/)
    expect(await storage.listEntries()).toEqual([entry])
  })

  it('detects any change since the preview before overwriting records', async () => {
    await storage.saveEntry(entry)
    const snapshot = await storage.listEntries()
    const changedElsewhere = { ...entry, note: 'Edited in another tab' }
    await storage.saveEntry(changedElsewhere)
    await expect(storage.mergeEntries([{ ...entry, english: 'From backup' }], snapshot)).rejects.toBeInstanceOf(storage.ImportConflictError)
    expect(await storage.listEntries()).toEqual([changedElsewhere])
  })

  it('detects additions and deletions since preview, including an initially empty journal', async () => {
    await storage.saveEntry(entry)
    await expect(storage.mergeEntries([{ ...entry, id: 'imported' }], [])).rejects.toBeInstanceOf(storage.ImportConflictError)
    const snapshot = await storage.listEntries()
    await storage.deleteEntry(entry.id)
    await expect(storage.mergeEntries([entry], snapshot)).rejects.toBeInstanceOf(storage.ImportConflictError)
    expect(await storage.listEntries()).toEqual([])
  })

  it('merges when the reviewed snapshot still matches, regardless of ordering', async () => {
    const second = { ...entry, id: 'second' }
    await storage.mergeEntries([entry, second])
    const snapshot = (await storage.listEntries()).reverse()
    const imported = { ...entry, favorite: true }
    await storage.mergeEntries([imported], snapshot)
    expect(await storage.listEntries()).toEqual(expect.arrayContaining([imported, second]))
  })

  it('reports unavailable storage and can retry after availability is restored', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(storage.listEntries()).rejects.toThrow(/Local storage is unavailable/)
    vi.stubGlobal('indexedDB', new IDBFactory())
    await storage.saveEntry(entry)
    expect(await storage.listEntries()).toEqual([entry])
  })

  it('allows creating a new ID once and refuses to overwrite a colliding ID', async () => {
    await storage.saveEntry(entry, null)
    await expect(storage.saveEntry({ ...entry, english: 'A different entry' }, null)).rejects.toBeInstanceOf(storage.EntryConflictError)
    expect(await storage.listEntries()).toEqual([entry])
  })

  it('saves only if the original entry snapshot still matches', async () => {
    await storage.saveEntry(entry, null)
    const edited = { ...entry, favorite: true }
    await storage.saveEntry(edited, entry)
    await expect(storage.saveEntry({ ...entry, english: 'Stale edit' }, entry)).rejects.toBeInstanceOf(storage.EntryConflictError)
    expect(await storage.listEntries()).toEqual([edited])
  })

  it('does not resurrect a record deleted while an editor was open', async () => {
    await storage.saveEntry(entry, null)
    await storage.deleteEntry(entry.id)
    await expect(storage.saveEntry({ ...entry, english: 'Stale edit' }, entry)).rejects.toBeInstanceOf(storage.EntryConflictError)
    expect(await storage.listEntries()).toEqual([])
  })

  it('does not delete a record changed since the deletion confirmation', async () => {
    await storage.saveEntry(entry)
    const changed = { ...entry, chinese: '新的意思' }
    await storage.saveEntry(changed, entry)
    await expect(storage.deleteEntry(entry.id, entry)).rejects.toBeInstanceOf(storage.EntryConflictError)
    expect(await storage.listEntries()).toEqual([changed])
    await storage.deleteEntry(changed.id, changed)
    expect(await storage.listEntries()).toEqual([])
  })

  it('rejects an oversized merge atomically and retains every existing record', async () => {
    await storage.saveEntry(entry)
    const incoming = entriesNearCapacity()
    incoming.push({ ...incoming[0], id: 'another-large-entry' })
    await expect(storage.mergeEntries(incoming)).rejects.toBeInstanceOf(storage.JournalCapacityError)
    expect(await storage.listEntries()).toEqual([entry])
  })

  it('reserves exportable capacity for saves and allows deletion to free it', async () => {
    const nearLimit = entriesNearCapacity()
    await storage.mergeEntries(nearLimit)
    const next = { ...nearLimit[0], id: 'another-large-entry' }
    await expect(storage.saveEntry(next, null)).rejects.toBeInstanceOf(storage.JournalCapacityError)
    const saved = await storage.listEntries()
    expect(saved).toHaveLength(nearLimit.length)
    const backup = JSON.stringify(createBackup(saved), null, 2)
    expect(new TextEncoder().encode(backup).byteLength).toBeLessThanOrEqual(MAX_BACKUP_BYTES)
    expect(parseBackup(backup)).toHaveLength(nearLimit.length)
    await storage.deleteEntry(nearLimit[0].id, nearLimit[0])
    await storage.saveEntry(next, null)
    expect(await storage.listEntries()).toHaveLength(nearLimit.length)
  })
})
