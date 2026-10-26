// This version tracks IndexedDB schema changes, independently of app releases
// and the JSON backup schema. UI-only updates must not increase it.
export const DATABASE_VERSION = 1

export type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void

export const DATABASE_MIGRATIONS: Readonly<Record<number, DatabaseMigration>> = {
  1(database) {
    if (!database.objectStoreNames.contains('entries')) {
      database.createObjectStore('entries', { keyPath: 'id' })
    }
  },
}

/**
 * Run each missing schema step inside IndexedDB's one upgrade transaction.
 * Migrations may enqueue IDB requests, but must not await external work. Request
 * errors abort this transaction by default; synchronous errors abort it here.
 */
export function runMigrations(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
  migrations: Readonly<Record<number, DatabaseMigration>> = DATABASE_MIGRATIONS,
): void {
  try {
    if (!Number.isInteger(oldVersion) || !Number.isInteger(newVersion) || oldVersion < 0 || newVersion < oldVersion) {
      throw new Error('Invalid database migration version range.')
    }
    if (oldVersion === newVersion) return
    if (transaction.mode !== 'versionchange') throw new Error('Database migrations require an upgrade transaction.')

    // Check the complete path before running any step, so missing migrations
    // cannot leave a partially scheduled schema change.
    const plan: DatabaseMigration[] = []
    for (let version = oldVersion + 1; version <= newVersion; version += 1) {
      const migration = migrations[version]
      if (!migration) throw new Error(`Missing database migration for version ${version}.`)
      plan.push(migration)
    }
    for (const migration of plan) migration(database, transaction)
  } catch (error) {
    try { transaction.abort() } catch { /* It may already have been aborted by IndexedDB. */ }
    throw error
  }
}
