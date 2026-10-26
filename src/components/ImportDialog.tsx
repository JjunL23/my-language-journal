import { ArrowUpFromLine, FileJson, Info, LoaderCircle } from 'lucide-react'
import { previewImport, previewReplacement } from '../lib/backup'
import type { ImportMode, ImportPlan } from '../lib/ui'
import { Modal } from './Modal'

interface Props {
  plan: ImportPlan
  mode: ImportMode
  busy: boolean
  notice: string
  replaceConfirmation: boolean
  onModeChange: (mode: ImportMode) => void
  onCancel: () => void
  onContinue: () => void
  onConfirmReplace: () => Promise<void>
  onKeepJournal: () => void
}

export function ImportDialog({
  plan,
  mode,
  busy,
  notice,
  replaceConfirmation,
  onModeChange,
  onCancel,
  onContinue,
  onConfirmReplace,
  onKeepJournal,
}: Props) {
  const summary = previewImport(plan.existing, plan.incoming)
  const replacement = previewReplacement(plan.existing, plan.incoming)
  return (
    <>
      <Modal
        title="Bring your words home."
        eyebrow="REVIEW YOUR BACKUP"
        onClose={onCancel}
        className="import-modal"
        busy={busy}
      >
        <div className="import-content">
          <div className="import-file">
            <FileJson size={24} />
            <div>
              <strong>{plan.filename}</strong>
              <span>{plan.incoming.length} entries · JSON backup v1</span>
            </div>
          </div>
          <div className="import-mode" role="group" aria-label="Import mode">
            <button
              type="button"
              aria-pressed={mode === 'merge'}
              className={mode === 'merge' ? 'selected' : ''}
              onClick={() => onModeChange('merge')}
              disabled={busy}
            >
              Merge
            </button>
            <button
              type="button"
              aria-pressed={mode === 'replace'}
              className={mode === 'replace' ? 'selected' : ''}
              onClick={() => onModeChange('replace')}
              disabled={busy}
            >
              Replace
            </button>
          </div>
          <div className="import-summary">
            <div>
              <strong>{summary.added}</strong>
              <span>New entries</span>
            </div>
            <div className={summary.updated > 0 ? 'has-overwrites' : ''}>
              <strong>{summary.updated}</strong>
              <span>Replaced</span>
            </div>
            <div>
              <strong>{summary.unchanged}</strong>
              <span>Unchanged</span>
            </div>
          </div>
          {mode === 'merge' ? (
            <p className="import-explanation">
              New IDs are added. Matching IDs with changes are replaced by the backup’s version,
              including translations, notes, and favorites. Entries outside this backup stay in your
              journal.
            </p>
          ) : (
            <p className="import-explanation">
              Replace makes this backup your entire journal. Your journal will contain{' '}
              <strong>{replacement.total} entries</strong>;{' '}
              <strong>{replacement.removed} existing entries</strong> outside the backup will be
              removed.
            </p>
          )}
          {(mode === 'replace' || summary.updated > 0) && (
            <div className="backup-note">
              <Info size={17} />
              <p>
                {mode === 'replace'
                  ? 'Export your current journal first if you want to keep it. A second confirmation is required before replacing anything.'
                  : 'This backup will replace existing entries. Export your current journal first if you want to keep both versions.'}
              </p>
            </div>
          )}
          {notice && (
            <p className="form-error" role="alert">
              {notice}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button className="button secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`button ${mode === 'replace' ? 'danger' : 'primary'}`}
            onClick={onContinue}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spinning" size={16} /> : <ArrowUpFromLine size={17} />}
            {mode === 'replace' ? 'Continue with replace' : 'Confirm import'}
          </button>
        </footer>
      </Modal>
      {replaceConfirmation && (
        <Modal
          title="Replace your journal?"
          eyebrow="THIS REPLACES YOUR CURRENT DATA"
          onClose={onKeepJournal}
          className="confirm-modal replace-confirmation"
          busy={busy}
        >
          <div className="confirm-content">
            <p>
              Your journal will contain <strong>{replacement.total} entries</strong> from this
              backup. <strong>{replacement.removed} existing entries</strong> will be removed and{' '}
              <strong>{replacement.updated}</strong> will be replaced.
            </p>
            <p className="replace-warning">
              This cannot be undone without a backup of your current journal.
            </p>
          </div>
          <footer className="modal-footer">
            <button className="button secondary" onClick={onKeepJournal} disabled={busy}>
              Keep my journal
            </button>
            <button
              className="button danger"
              onClick={() => void onConfirmReplace()}
              disabled={busy}
            >
              {busy && <LoaderCircle className="spinning" size={16} />}Replace journal
            </button>
          </footer>
        </Modal>
      )}
    </>
  )
}
