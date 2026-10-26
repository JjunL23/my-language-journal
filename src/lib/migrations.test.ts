import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { DATABASE_MIGRATIONS, DATABASE_VERSION, runMigrations, type DatabaseMigration } from './migrations'
import type { Entry } from './entries'

const original: Entry = {
  id: 'existing-record', type: 'word', english: 'Improve', chinese: '改善', malay: 'Meningkatkan', note: 'Keep this note', favorite: true,
  createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z',
}

function open(
  factory: IDBFactory,
  version: number,
  upgrade: (database: IDBDatabase, transaction: IDBTransaction, oldVersion: number, newVersion: number) => void = runMigrations,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('migration-test', version)
    let failure: unknown
    request.onupgradeneeded = (event) => {
      try {
        upgrade(request.result, request.transaction!, event.oldVersion, event.newVersion!)
      } catch (error) {
        failure = error
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(failure ?? request.error)
  })
}

function write(database: IDBDatabase, entry: Entry): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('entries', 'readwrite')
    transaction.objectStore('entries').put(entry)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

function read(database: IDBDatabase): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('entries', 'readonly')
    const request = transaction.objectStore('entries').getAll()
    transaction.oncomplete = () => resolve(request.result as Entry[])
    transaction.onabort = () => reject(transaction.error)
  })
}

describe('sequential database migrations', () => {
  it('keeps the deployed schema at version 1 and preserves records on a same-version reopen', async () => {
    expect(DATABASE_VERSION).toBe(1)
    const factory = new IDBFactory()
    const first = await open(factory, DATABASE_VERSION)
    expect(first.objectStoreNames.contains('entries')).toBe(true)
    await write(first, original)
    first.close()

    const upgrade = vi.fn(runMigrations)
    const reopened = await open(factory, DATABASE_VERSION, upgrade)
    expect(upgrade).not.toHaveBeenCalled()
    expect(await read(reopened)).toEqual([original])
    expect(reopened.version).toBe(1)
    reopened.close()
  })

  it('does no work for an already applied migration range', async () => {
    const factory = new IDBFactory()
    const database = await open(factory, DATABASE_VERSION)
    await write(database, original)
    const unused = vi.fn<DatabaseMigration>()
    const transaction = database.transaction('entries', 'readonly')
    runMigrations(database, transaction, 1, 1, { 1: unused })
    expect(unused).not.toHaveBeenCalled()
    expect(await read(database)).toEqual([original])
    database.close()
  })

  it('applies each missing step in order in one upgrade transaction', async () => {
    const factory = new IDBFactory()
    const applied: number[] = []
    const migrations: Record<number, DatabaseMigration> = {
      1(database, transaction) {
        applied.push(1)
        DATABASE_MIGRATIONS[1](database, transaction)
        transaction.objectStore('entries').put(original)
      },
      2(_database, transaction) {
        applied.push(2)
        transaction.objectStore('entries').createIndex('type', 'type')
      },
    }
    const database = await open(factory, 2, (database, transaction, oldVersion, newVersion) => {
      runMigrations(database, transaction, oldVersion, newVersion, migrations)
    })
    expect(applied).toEqual([1, 2])
    expect(database.transaction('entries').objectStore('entries').indexNames.contains('type')).toBe(true)
    expect(await read(database)).toEqual([original])
    database.close()
  })

  it('rolls back schema and data changes when an upgrade step fails', async () => {
    const factory = new IDBFactory()
    const first = await open(factory, 1)
    await write(first, original)
    first.close()

    await expect(open(factory, 2, (database, transaction, oldVersion, newVersion) => {
      runMigrations(database, transaction, oldVersion, newVersion, {
        ...DATABASE_MIGRATIONS,
        2(database, transaction) {
          database.createObjectStore('temporary')
          transaction.objectStore('entries').put({ ...original, note: 'Must not survive failure' })
          throw new Error('Synthetic migration failure')
        },
      })
    })).rejects.toThrow(/Synthetic migration failure/)

    const restored = await open(factory, 1)
    expect(restored.version).toBe(1)
    expect(restored.objectStoreNames.contains('temporary')).toBe(false)
    expect(await read(restored)).toEqual([original])
    restored.close()
  })

  it('rejects a missing migration path before executing its earlier steps', async () => {
    const factory = new IDBFactory()
    const first = await open(factory, 1)
    await write(first, original)
    first.close()
    const stepTwo = vi.fn<DatabaseMigration>()
    await expect(open(factory, 3, (database, transaction, oldVersion, newVersion) => {
      runMigrations(database, transaction, oldVersion, newVersion, { 2: stepTwo })
    })).rejects.toThrow(/Missing database migration for version 3/)
    expect(stepTwo).not.toHaveBeenCalled()
    const restored = await open(factory, 1)
    expect(await read(restored)).toEqual([original])
    restored.close()
  })
})
