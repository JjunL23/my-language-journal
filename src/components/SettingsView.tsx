import { useRef } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Check,
  CheckCircle2,
  CloudOff,
  Download,
  FileJson,
  HardDrive,
  Info,
  Plus,
} from 'lucide-react'
interface Props {
  entryCount: number
  loading: boolean
  loadError: string
  busy: boolean
  importError: string
  offlineReady: boolean
  pwaError: string
  persisted: boolean | null
  storageNotice: string
  exportBackup: () => Promise<void>
  readImport: (file: File | undefined) => Promise<void>
  requestPersistence: () => Promise<void>
}
export function SettingsView({
  entryCount,
  loading,
  loadError,
  busy,
  importError,
  offlineReady,
  pwaError,
  persisted,
  storageNotice,
  exportBackup,
  readImport,
  requestPersistence,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <>
      <section className="page-heading settings-heading">
        <div>
          <p className="eyebrow">TAKE CARE OF YOUR COLLECTION</p>
          <h1>
            Make yourself at home<span className="heading-dot">.</span>
          </h1>
          <p className="page-description">
            Your journal stays on this device. Keep a copy somewhere safe.
          </p>
        </div>
      </section>
      <div className="settings-content">
        <section className="settings-section">
          <div className="section-heading">
            <span className="section-icon">
              <FileJson size={22} />
            </span>
            <div>
              <h2>A copy for safekeeping</h2>
              <p>Back up your words and bring them back whenever you need.</p>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-icon">
              <ArrowDownToLine size={22} />
            </div>
            <div className="settings-row-content">
              <h3>Export your journal</h3>
              <p>
                Save all {entryCount} {entryCount === 1 ? 'entry' : 'entries'}, notes, and favorites
                in a JSON file.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => void exportBackup()}
              disabled={busy || loading || !!loadError}
            >
              <Download size={16} />
              Export JSON
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-icon">
              <ArrowUpFromLine size={22} />
            </div>
            <div className="settings-row-content">
              <h3>Bring back a backup</h3>
              <p>Preview changes before merging a backup into this journal.</p>
            </div>
            <button
              className="button secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy || loading || !!loadError}
            >
              <Plus size={16} />
              Import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Import JSON backup"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                void readImport(file)
              }}
            />
          </div>
          {importError && (
            <div className="form-error settings-error" role="alert">
              {importError}
            </div>
          )}
          <div className="backup-note">
            <Info size={17} />
            <p>
              Local storage isn’t a permanent backup. Clearing website data or reinstalling can
              remove your journal. Export regularly, especially before changing devices.
            </p>
          </div>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <span className="section-icon">
              <HardDrive size={22} />
            </span>
            <div>
              <h2>Right here, on your device</h2>
              <p>A personal space. No account, no cloud, no translation API.</p>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-content">
              <h3>Offline access</h3>
              <p>
                {import.meta.env.DEV
                  ? 'Use the production preview or published app to test offline access.'
                  : offlineReady
                    ? 'The app is cached. You can view and edit entries without internet.'
                    : pwaError
                      ? 'Offline setup needs another try. Reconnect and reload the app.'
                      : 'Keep the app open online until its files finish downloading.'}
              </p>
            </div>
            <span className={`status-badge ${offlineReady ? 'ready' : ''}`}>
              {offlineReady ? <CheckCircle2 size={15} /> : <CloudOff size={15} />}
              {offlineReady ? 'Ready' : import.meta.env.DEV ? 'Preview' : 'Not ready'}
            </span>
          </div>
          <div className="settings-row">
            <div className="settings-row-content">
              <h3>Storage protection</h3>
              <p>Ask your browser to keep your journal when space gets tight.</p>
            </div>
            <button
              className="button secondary"
              onClick={() => void requestPersistence()}
              disabled={persisted === true}
            >
              {persisted ? (
                <>
                  <Check size={16} />
                  Enabled
                </>
              ) : (
                'Protect storage'
              )}
            </button>
          </div>
          {storageNotice && (
            <p className="inline-notice" role="status">
              {storageNotice}
            </p>
          )}
        </section>
        <section className="install-note">
          <div className="section-icon">
            <BookOpen size={23} />
          </div>
          <div>
            <h2>A little journal on your home screen</h2>
            <p>
              On iPhone, open the published HTTPS link in Safari, tap Share, then{' '}
              <strong>Add to Home Screen</strong>. Enable <strong>Open as Web App</strong> if shown.
            </p>
            <p className="muted">
              Open it once online, then check that offline access is ready. Safari and the installed
              app may have separate journals; use JSON export and import to move your entries.
            </p>
          </div>
        </section>
        <div className="settings-signoff">
          <BookOpen size={20} />
          <span>My Language Journal</span>
          <span>Version 1.0 · A word at a time.</span>
        </div>
      </div>
    </>
  )
}
