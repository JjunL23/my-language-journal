import { ArrowRight, BookOpen, Star, StickyNote } from 'lucide-react'
import type { Entry } from '../lib/entries'
import { entryTitle, formatDate, languages } from '../lib/ui'
interface Props {
  entry: Entry
  busy: boolean
  onFavorite: (entry: Entry) => Promise<void>
  onOpen: () => void
}
export function EntryCard({ entry, busy, onFavorite, onOpen }: Props) {
  return (
    <article className={`entry-card ${entry.type}`}>
      <div className="card-top">
        <span className={`type-label ${entry.type}`}>
          {entry.type === 'word' ? 'Word' : 'Chunk'}
        </span>
        <button
          className={`icon-button favorite-button ${entry.favorite ? 'is-favorite' : ''}`}
          aria-label={`${entry.favorite ? 'Unfavorite' : 'Favorite'} ${entryTitle(entry)}`}
          aria-pressed={entry.favorite}
          onClick={() => void onFavorite(entry)}
          disabled={busy}
        >
          <Star size={19} fill={entry.favorite ? 'currentColor' : 'none'} strokeWidth={1.6} />
        </button>
      </div>
      <button className="entry-open" onClick={onOpen} aria-label={`View ${entryTitle(entry)}`}>
        <h2 lang={entry.english ? 'en' : entry.chinese ? 'zh' : 'ms'}>{entryTitle(entry)}</h2>
        <div className="entry-translations">
          {languages
            .filter(
              (language) =>
                language.key !== (entry.english ? 'english' : entry.chinese ? 'chinese' : 'malay'),
            )
            .map((language) => (
              <div key={language.key}>
                <span className="language-code">{language.short}</span>
                <span
                  lang={language.lang}
                  className={!entry[language.key] ? 'translation-missing' : ''}
                >
                  {entry[language.key] || 'Add a translation later'}
                </span>
              </div>
            ))}
        </div>
        <div className="card-footer">
          <span>
            {entry.note ? (
              <>
                <StickyNote size={13} />
                With a note
              </>
            ) : (
              <>
                <BookOpen size={13} />A little discovery
              </>
            )}
          </span>
          <span>
            {formatDate(entry.createdAt)}
            <ArrowRight size={15} />
          </span>
        </div>
      </button>
    </article>
  )
}
