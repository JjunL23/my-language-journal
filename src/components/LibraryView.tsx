import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  HardDrive,
  Heart,
  LoaderCircle,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import type { Entry } from '../lib/entries'
import { matchesSearch } from '../lib/entries'
import type { Filter, Page } from '../lib/ui'
import { entryTitle } from '../lib/ui'
import { EntryCard } from './EntryCard'
interface Props {
  page: 'library' | 'favorites'
  entries: Entry[]
  loading: boolean
  loadError: string
  busy: boolean
  openEditor: () => void
  toggleFavorite: (entry: Entry) => Promise<void>
  setDetailId: (id: string) => void
  navigate: (page: Page) => void
  refresh: (showLoading?: boolean) => Promise<Entry[] | null>
}
export function LibraryView({
  page,
  entries,
  loading,
  loadError,
  busy,
  openEditor,
  toggleFavorite,
  setDetailId,
  navigate,
  refresh,
}: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState('recent')
  const activeEntries = useMemo(
    () => (page === 'favorites' ? entries.filter((entry) => entry.favorite) : entries),
    [entries, page],
  )
  const counts = {
    all: activeEntries.length,
    word: activeEntries.filter((entry) => entry.type === 'word').length,
    chunk: activeEntries.filter((entry) => entry.type === 'chunk').length,
  }
  const visibleEntries = useMemo(
    () =>
      activeEntries
        .filter(
          (entry) => (filter === 'all' || entry.type === filter) && matchesSearch(entry, search),
        )
        .sort((a, b) =>
          sort === 'alpha'
            ? entryTitle(a).localeCompare(entryTitle(b))
            : sort === 'updated'
              ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
              : Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
    [activeEntries, filter, search, sort],
  )
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            {page === 'favorites' ? 'KEEP THE GOOD ONES CLOSE' : 'COLLECT A LITTLE, LEARN A LITTLE'}
          </p>
          <h1>
            {page === 'favorites' ? 'Your favorites' : 'Your library'}
            <span className="heading-dot">.</span>
          </h1>
          <p className="page-description">
            {page === 'favorites'
              ? 'The words and phrases you want to come back to.'
              : 'Words, phrases, and the little things you want to remember.'}
          </p>
        </div>
        <button
          className="button primary add-entry-button"
          aria-label="New entry"
          onClick={() => openEditor()}
          disabled={loading || !!loadError}
        >
          <Plus size={19} />
          <span>New entry</span>
        </button>
      </section>
      <section className="library-tools" aria-label="Search and filter entries">
        <div className="search-field">
          <Search size={20} />
          <input
            aria-label="Search entries"
            placeholder="Search in any language…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
          />
          {search && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={17} />
            </button>
          )}
          <span className="search-languages">EN · BM · 中</span>
        </div>
        <div className="filter-line">
          <div className="filter-tabs" role="group" aria-label="Entry type">
            {(['all', 'word', 'chunk'] as const).map((type) => (
              <button
                className={filter === type ? 'selected' : ''}
                key={type}
                aria-pressed={filter === type}
                onClick={() => setFilter(type)}
              >
                {type === 'all' ? 'All entries' : type === 'word' ? 'Words' : 'Chunks'}
                <span>{counts[type]}</span>
              </button>
            ))}
          </div>
          {activeEntries.length > 0 && (
            <label className="sort-select">
              <span className="sr-only">Sort entries</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="recent">Newest first</option>
                <option value="updated">Recently edited</option>
                <option value="alpha">Alphabetical</option>
              </select>
              <ChevronDown size={14} />
            </label>
          )}
        </div>
      </section>
      {loading ? (
        <div className="loading-state" role="status">
          <LoaderCircle className="spinning" size={24} />
          Opening your journal…
        </div>
      ) : loadError ? (
        <div className="error-state" role="alert">
          <HardDrive size={32} />
          <h2>Your journal couldn’t be opened</h2>
          <p>{loadError}</p>
          <button
            className="button secondary"
            onClick={() => {
              void refresh(true)
            }}
          >
            Try again
          </button>
        </div>
      ) : visibleEntries.length > 0 ? (
        <>
          <div className="collection-label">
            <span>
              {search
                ? 'SEARCH RESULTS'
                : page === 'favorites'
                  ? 'SAVED FOR LATER'
                  : 'YOUR COLLECTION'}
            </span>
            <span>
              {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="entry-grid">
            {visibleEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                busy={busy}
                onFavorite={toggleFavorite}
                onOpen={() => setDetailId(entry.id)}
              />
            ))}
          </div>
          <div className="collection-end">
            <span />
            {search ? 'A little discovery, found again.' : 'One entry at a time.'}
            <span />
          </div>
        </>
      ) : search || filter !== 'all' ? (
        <div className="empty-state compact-empty">
          <div className="empty-icon">
            <Search size={29} />
          </div>
          <h2>No words found here</h2>
          <p>Try another language, a shorter search, or a different type.</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch('')
              setFilter('all')
            }}
          >
            Clear filters
          </button>
        </div>
      ) : page === 'favorites' ? (
        <div className="empty-state">
          <div className="empty-icon favorite-empty">
            <Star size={32} />
          </div>
          <p className="eyebrow">A PLACE FOR YOUR FAVORITES</p>
          <h2>Some words stay with you.</h2>
          <p>
            Tap the star on any entry to keep it here.
            <br />
            Your original entry will always stay in your library.
          </p>
          <button className="button secondary" onClick={() => navigate('library')}>
            Explore your library
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="empty-state first-page">
          <div className="notebook-art" aria-hidden="true">
            <div className="art-spark">✳</div>
            <div className="paper paper-back" />
            <div className="paper paper-front">
              <div className="paper-eyebrow">LITTLE DISCOVERIES</div>
              <div className="paper-word">
                Hello<span>.</span>
              </div>
              <div className="paper-line" />
              <div className="paper-translations">
                <span>你好</span>
                <i>·</i>
                <span>Helo</span>
              </div>
              <div className="paper-lines">
                <span />
                <span />
              </div>
              <span className="paper-star">✧</span>
            </div>
            <span className="art-dot" />
          </div>
          <p className="eyebrow">YOUR FIRST PAGE STARTS HERE</p>
          <h2>Good words deserve a place.</h2>
          <p>
            A new word. A useful phrase. A way to say it in three languages.
            <br className="desktop-break" /> Make a little room for what you learn.
          </p>
          <button className="button primary" onClick={() => openEditor()}>
            <Plus size={18} />
            Add your first entry
          </button>
          <button className="empty-import text-button" onClick={() => navigate('settings')}>
            Already have a journal? Import a backup
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <footer className="page-footer">
        <span>
          <Heart size={13} />
          Made for your own pace.
        </span>
        <span>
          English <i>·</i> Bahasa Melayu <i>·</i> 中文
        </span>
      </footer>
    </>
  )
}
