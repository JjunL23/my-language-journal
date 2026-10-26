import { ArrowRight, Star, StickyNote, Trash2 } from 'lucide-react'
import type { Entry } from '../lib/entries'
import { formatDate, languages } from '../lib/ui'
import { Modal } from './Modal'

interface Props {
  entry: Entry
  busy: boolean
  error: string
  notice: string
  onClose: () => void
  onFavorite: (entry: Entry) => Promise<void>
  onEdit: (entry: Entry) => void
  onDelete: (entry: Entry) => void
}

export function EntryDetails({
  entry,
  busy,
  error,
  notice,
  onClose,
  onFavorite,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Modal
      title="A little discovery"
      eyebrow="FROM YOUR JOURNAL"
      onClose={onClose}
      className="detail-modal"
      busy={busy}
    >
      <div className="detail-content">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="detail-notice" role="status">
            {notice}
          </p>
        )}
        <div className="detail-meta">
          <span className={`type-label ${entry.type}`}>
            {entry.type === 'word' ? 'Word' : 'Chunk'}
          </span>
          <button
            className={`favorite-detail ${entry.favorite ? 'is-favorite' : ''}`}
            onClick={() => void onFavorite(entry)}
            disabled={busy}
            aria-pressed={entry.favorite}
          >
            <Star size={18} fill={entry.favorite ? 'currentColor' : 'none'} />
            {entry.favorite ? 'Favorited' : 'Add to favorites'}
          </button>
        </div>
        <div className="detail-languages">
          {languages.map((language) => (
            <section key={language.key}>
              <div className="detail-language-label">
                <span className="language-code">{language.short}</span>
                <span>{language.label}</span>
              </div>
              <p lang={language.lang} className={!entry[language.key] ? 'translation-missing' : ''}>
                {entry[language.key] || 'A translation for another day.'}
              </p>
            </section>
          ))}
        </div>
        {entry.note && (
          <section className="detail-note">
            <h3>
              <StickyNote size={16} />A note to remember
            </h3>
            <p>{entry.note}</p>
          </section>
        )}
        <div className="entry-dates">
          <span>Added {formatDate(entry.createdAt, true)}</span>
          <span>Edited {formatDate(entry.updatedAt, true)}</span>
        </div>
      </div>
      <footer className="modal-footer">
        <button className="button danger-text" onClick={() => onDelete(entry)} disabled={busy}>
          <Trash2 size={17} />
          Delete
        </button>
        <button className="button primary" onClick={() => onEdit(entry)} disabled={busy}>
          Edit entry
          <ArrowRight size={17} />
        </button>
      </footer>
    </Modal>
  )
}
