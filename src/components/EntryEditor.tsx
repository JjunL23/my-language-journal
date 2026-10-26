import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, BookOpen, Check, Globe2, Info, LoaderCircle, StickyNote } from 'lucide-react'
import type { Entry, EntryDraft } from '../lib/entries'
import { FIELD_LIMITS, findDuplicateEntries } from '../lib/entries'
import type { EditorState } from '../lib/ui'
import { languages } from '../lib/ui'
import { Modal } from './Modal'

interface Props {
  editor: EditorState
  entries: Entry[]
  busy: boolean
  error: string
  onChange: (draft: EntryDraft) => void
  onClose: () => void
  onSubmit: () => Promise<void>
}

export function EntryEditor({ editor, entries, busy, error, onChange, onClose, onSubmit }: Props) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  const duplicates = useMemo(
    () => findDuplicateEntries(entries, editor.draft, editor.original?.id),
    [entries, editor.draft, editor.original?.id],
  )
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [error])

  return (
    <Modal
      title={editor.original ? 'A little fine-tuning.' : 'What did you discover?'}
      eyebrow={editor.original ? 'EDIT YOUR ENTRY' : 'A NEW PAGE IN YOUR JOURNAL'}
      onClose={onClose}
      className="editor-modal"
      busy={busy}
      keyboardAware
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit()
        }}
      >
        <div className="editor-content">
          <div className="form-type">
            <span className="field-label">Entry type</span>
            <div className="type-picker" role="group" aria-label="Entry type">
              {(['word', 'chunk'] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  aria-pressed={editor.draft.type === type}
                  className={editor.draft.type === type ? 'selected' : ''}
                  onClick={() => onChange({ ...editor.draft, type })}
                  disabled={busy}
                >
                  {type === 'word' ? <BookOpen size={16} /> : <StickyNote size={16} />}
                  {type === 'word' ? 'Word' : 'Chunk'}
                  {editor.draft.type === type && <Check size={15} />}
                </button>
              ))}
            </div>
            <p className="field-help">
              {editor.draft.type === 'word'
                ? 'One word, a world of meaning.'
                : 'A useful group of words, saved together.'}
            </p>
          </div>
          <div className="form-instruction">
            <Globe2 size={16} />
            Fill in at least one language. The rest can come later.
          </div>
          {languages.map((language) => (
            <label className="language-field" key={language.key}>
              <span className="field-label">
                <span>{language.label}</span>
                <span className="field-language">{language.hint}</span>
              </span>
              <textarea
                rows={2}
                lang={language.lang}
                placeholder={language.placeholder}
                value={editor.draft[language.key]}
                maxLength={FIELD_LIMITS[language.key]}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...editor.draft, [language.key]: event.target.value })
                }
              />
            </label>
          ))}
          {duplicates.length > 0 && (
            <div className="duplicate-notice" role="status">
              <Info size={17} />
              <p>This entry is already in your journal. You can still save another copy.</p>
            </div>
          )}
          <label className="language-field note-field">
            <span className="field-label">
              <span>
                <StickyNote size={15} />
                Notes
              </span>
              <span className="optional">Optional</span>
            </span>
            <textarea
              rows={3}
              placeholder="An example, a little context, or a way to remember…"
              value={editor.draft.note}
              maxLength={FIELD_LIMITS.note}
              disabled={busy}
              onChange={(event) => onChange({ ...editor.draft, note: event.target.value })}
            />
          </label>
          {error && (
            <p ref={errorRef} role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button plain" onClick={onClose} disabled={busy}>
            <ArrowLeft size={16} />
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? <LoaderCircle className="spinning" size={17} /> : <Check size={17} />}
            {busy ? 'Saving…' : editor.original ? 'Save changes' : 'Save entry'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
