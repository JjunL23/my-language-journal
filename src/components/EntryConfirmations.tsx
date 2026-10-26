import { LoaderCircle, Trash2 } from 'lucide-react'
import type { Entry } from '../lib/entries'
import { entryTitle } from '../lib/ui'
import { Modal } from './Modal'

export function DiscardConfirmation({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <Modal title="Leave this page?" onClose={onKeep} className="confirm-modal">
      <div className="confirm-content">
        <p>Your unsaved changes will be lost.</p>
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onKeep}>
          Keep writing
        </button>
        <button className="button danger" onClick={onDiscard}>
          Discard changes
        </button>
      </footer>
    </Modal>
  )
}

interface DeleteProps {
  entry: Entry
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}
export function DeleteConfirmation({ entry, busy, error, onCancel, onConfirm }: DeleteProps) {
  return (
    <Modal
      title="Delete this entry?"
      eyebrow="MAKE A LITTLE ROOM"
      onClose={onCancel}
      className="confirm-modal"
      busy={busy}
    >
      <div className="confirm-content">
        <p>
          <strong className="delete-entry-name">“{entryTitle(entry)}”</strong> will be removed from
          your journal and favorites. This can’t be undone.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onCancel} disabled={busy}>
          Keep entry
        </button>
        <button className="button danger" onClick={() => void onConfirm()} disabled={busy}>
          {busy ? <LoaderCircle className="spinning" size={16} /> : <Trash2 size={16} />}Delete
          entry
        </button>
      </footer>
    </Modal>
  )
}
