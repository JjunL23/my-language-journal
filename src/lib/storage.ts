import { assertEntry, entriesEqual, type Entry } from './entries'
import { BackupCapacityError, createBackup } from './backup'
import { DATABASE_VERSION, runMigrations } from './migrations'

const DATABASE_NAME = 'my-language-journal'
const STORE_NAME = 'entries'
let databasePromise: Promise<IDBDatabase> | undefined

export class ImportConflictError extends Error {
  constructor() {
    super('Your journal changed since the import preview. Review the updated counts and confirm again.')
    this.name = 'ImportConflictError'
  }
}

export class EntryConflictError extends Error {
  constructor() {
    super('This entry changed or was deleted in another window. Reopen its latest version before trying again.')
    this.name = 'EntryConflictError'
  }
}

export class JournalCapacityError extends Error {
  constructor() {
    super('This change would exceed the journal limit of 10 MB or 50,000 entries. Export a backup and remove entries you no longer need before trying again. Your existing records were kept.')
    this.name = 'JournalCapacityError'
  }
}

function storageError(error?: DOMException | Error | null): Error {
  if (error?.name === 'QuotaExceededError') {
    return new Error('Your device storage is full. Export a backup and free some space, then try again.')
  }
  return new Error('Could not access this device’s journal storage. Check browser storage permissions and try again.')
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Local storage is unavailable in this browser. Open the app in Safari, Chrome, Edge, or Firefox.'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    } catch (error) {
      reject(storageError(error instanceof Error ? error : undefined))
      return
    }
    let settled = false
    const fail = (error: Error) => {
      settled = true
      reject(error)
    }
    let migrationFailure: Error | undefined
    request.onupgradeneeded = (event) => {
      const transaction = request.transaction
      if (settled) {
        transaction?.abort()
        return
      }
      try {
        if (!transaction) throw new Error('The database upgrade transaction is unavailable.')
        runMigrations(request.result, transaction, event.oldVersion, event.newVersion ?? DATABASE_VERSION)
      } catch {
        migrationFailure = new Error('The journal storage update could not finish. Existing records were kept. Close other copies of the app and try again.')
        try { transaction?.abort() } catch { /* The migration may have already aborted it. */ }
      }
    }
    request.onerror = () => fail(migrationFailure ?? storageError(request.error))
    request.onblocked = () => fail(new Error('Close other open copies of My Language Journal, then try again to finish opening local storage.'))
    request.onsuccess = () => {
      const database = request.result
      if (settled) {
        database.close()
        return
      }
      settled = true
      const invalidate = () => {
        database.close()
        databasePromise = undefined
      }
      database.onversionchange = invalidate
      database.onclose = () => { databasePromise = undefined }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        invalidate()
        reject(new Error('The journal database is missing its entries store. Restore from a backup in a fresh browser profile.'))
        return
      }
      resolve(database)
    }
  })
  databasePromise = opening
  void opening.catch(() => {
    if (databasePromise === opening) databasePromise = undefined
  })
  return opening
}

export async function listEntries(): Promise<Entry[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = database.transaction(STORE_NAME, 'readonly')
    } catch (error) {
      reject(storageError(error instanceof Error ? error : undefined))
      return
    }
    const request = transaction.objectStore(STORE_NAME).getAll()
    let entries: Entry[] = []
    request.onsuccess = () => { entries = request.result as Entry[] }
    transaction.oncomplete = () => {
      resolve(entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id)))
    }
    transaction.onabort = () => reject(storageError(transaction.error))
    transaction.onerror = () => { /* Aborting transactions are handled by onabort. */ }
  })
}

interface WriteOptions {
  deleteId?: string
  expectedExisting?: Entry[]
  expectedEntry?: Entry | null
  replace?: boolean
}

async function writeEntries(entries: Entry[], options: WriteOptions = {}): Promise<void> {
  // Validate the whole batch before opening a write transaction: no partial import.
  const ids = new Set<string>()
  for (const entry of entries) {
    assertEntry(entry)
    if (ids.has(entry.id)) throw new Error('Cannot save duplicate entry IDs in one operation.')
    ids.add(entry.id)
  }
  const incoming = entries.map((entry) => ({ ...entry }))
  const expected = options.expectedExisting?.map((entry) => ({ ...entry }))
  const expectedEntry = options.expectedEntry === null ? null : options.expectedEntry ? { ...options.expectedEntry } : undefined
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite')
    } catch (error) {
      reject(storageError(error instanceof Error ? error : undefined))
      return
    }
    let failure: Error | undefined
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(failure ?? storageError(transaction.error))
    transaction.onerror = () => { /* The entire transaction aborts on request errors. */ }
    try {
      const store = transaction.objectStore(STORE_NAME)
      if (options.deleteId !== undefined) {
        // Deletions always remain possible, including after restoring an older
        // database whose contents are already above the current capacity.
        const deleteId = options.deleteId
        if (expectedEntry !== undefined) {
          const request = store.get(deleteId)
          request.onsuccess = () => {
            const current = request.result as Entry | undefined
            if (!current || !expectedEntry || !entriesEqual(current, expectedEntry)) {
              failure = new EntryConflictError()
              transaction.abort()
              return
            }
            store.delete(deleteId)
          }
        } else {
          store.delete(deleteId)
        }
        return
      }

      // Capacity checks and conflict checks share the write transaction. Other
      // tabs cannot change the journal between these checks and the commit.
      const request = store.getAll()
      request.onsuccess = () => {
        try {
          const current = request.result as Entry[]
          if (expected) {
            const expectedById = new Map(expected.map((entry) => [entry.id, entry]))
            const matches = current.length === expected.length && expectedById.size === expected.length && current.every((entry) => {
              const previous = expectedById.get(entry.id)
              return previous !== undefined && entriesEqual(entry, previous)
            })
            if (!matches) throw new ImportConflictError()
          }

          const candidate = new Map((options.replace ? [] : current).map((entry) => [entry.id, entry]))
          if (expectedEntry !== undefined) {
            const previous = candidate.get(incoming[0].id)
            const matches = expectedEntry === null ? previous === undefined : previous !== undefined && entriesEqual(previous, expectedEntry)
            if (!matches) throw new EntryConflictError()
          }
          for (const entry of incoming) candidate.set(entry.id, entry)
          createBackup([...candidate.values()])
          // Validation, capacity, and the reviewed snapshot are checked before
          // clear. Clear and every put then commit or roll back together.
          if (options.replace) store.clear()
          for (const entry of incoming) store.put(entry)
        } catch (error) {
          failure = error instanceof BackupCapacityError ? new JournalCapacityError()
            : error instanceof ImportConflictError || error instanceof EntryConflictError ? error
              : storageError(error instanceof Error ? error : undefined)
          transaction.abort()
        }
      }
    } catch (error) {
      transaction.abort()
      reject(storageError(error instanceof Error ? error : undefined))
    }
  })
}

export function saveEntry(entry: Entry, expected?: Entry | null): Promise<void> {
  return writeEntries([entry], { expectedEntry: expected })
}

export function deleteEntry(id: string, expected?: Entry): Promise<void> {
  if (!id) return Promise.reject(new Error('Choose an entry to delete.'))
  return writeEntries([], { deleteId: id, expectedEntry: expected })
}

export function mergeEntries(entries: Entry[], expectedExisting?: Entry[]): Promise<void> {
  return writeEntries(entries, { expectedExisting })
}

export function replaceEntries(entries: Entry[], expectedExisting: Entry[]): Promise<void> {
  if (!Array.isArray(expectedExisting)) {
    return Promise.reject(new Error('Review the replacement preview before replacing your journal.'))
  }
  return writeEntries(entries, { expectedExisting, replace: true })
}
