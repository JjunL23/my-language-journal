import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Download,
  FileJson,
  Globe2,
  HardDrive,
  Heart,
  Info,
  Library,
  LoaderCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  StickyNote,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import type { Entry, EntryDraft } from './lib/entries'
import { createEntry, FIELD_LIMITS, matchesSearch, updateEntry, validateDraft } from './lib/entries'
import { deleteEntry, listEntries, mergeEntries, saveEntry } from './lib/storage'
import { createBackup, MAX_BACKUP_BYTES, parseBackup, previewImport } from './lib/backup'
import { setupPwa } from './lib/pwa'

type Page = 'library' | 'favorites' | 'settings'
type Filter = 'all' | 'word' | 'chunk'
type Editor = { original: Entry | null; draft: EntryDraft }
type ImportPlan = { incoming: Entry[]; existing: Entry[]; filename: string }
const EMPTY_DRAFT: EntryDraft = { type: 'word', english: '', chinese: '', malay: '', note: '' }
const navigation = [
  { id: 'library' as const, label: 'Library', icon: Library },
  { id: 'favorites' as const, label: 'Favorites', icon: Star },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
]
const languages = [
  {
    key: 'english' as const,
    label: 'English',
    short: 'EN',
    lang: 'en',
    placeholder: 'A word or phrase in English',
    hint: 'ENGLISH',
  },
  {
    key: 'chinese' as const,
    label: '中文',
    short: '中',
    lang: 'zh',
    placeholder: '输入中文词语或词块',
    hint: 'CHINESE',
  },
  {
    key: 'malay' as const,
    label: 'Bahasa Melayu',
    short: 'BM',
    lang: 'ms',
    placeholder: 'Perkataan atau frasa dalam Bahasa Melayu',
    hint: 'MALAY',
  },
]

function currentPage(): Page {
  const hash = window.location.hash.slice(1)
  return hash === 'favorites' || hash === 'settings' ? hash : 'library'
}
function entryTitle(entry: Entry) {
  return entry.english || entry.chinese || entry.malay
}
function formatDate(date: string, long = false) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  }).format(new Date(date))
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
function draftFrom(entry: Entry): EntryDraft {
  return {
    type: entry.type,
    english: entry.english,
    chinese: entry.chinese,
    malay: entry.malay,
    note: entry.note,
  }
}
function isDirty(editor: Editor) {
  return (
    JSON.stringify(editor.draft) !==
    JSON.stringify(editor.original ? draftFrom(editor.original) : EMPTY_DRAFT)
  )
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  className = '',
  busy = false,
}: {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  className?: string
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button close-button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

function App() {
  const [page, setPage] = useState<Page>(currentPage)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState('recent')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [formError, setFormError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null)
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  const [pwaError, setPwaError] = useState('')
  const [pendingUpdate, setPendingUpdate] = useState<(() => Promise<void>) | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [storageNotice, setStorageNotice] = useState('')
  const formErrorRef = useRef<HTMLParagraphElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const broadcast = useRef<BroadcastChannel | null>(null)
  const detail = entries.find((entry) => entry.id === detailId)
  const favorites = entries.filter((entry) => entry.favorite)
  const activeEntries = page === 'favorites' ? favorites : entries
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

  const refresh = useCallback(async () => {
    try {
      setEntries(await listEntries())
      setLoadError('')
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setDetailError('')
  }, [detailId])

  useEffect(() => {
    if (formError) formErrorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [formError])

  useEffect(() => {
    void refresh()
    const handleHash = () => {
      setPage(currentPage())
      setSearch('')
      setFilter('all')
    }
    const handleOnline = () => setOnline(navigator.onLine)
    const handleFocus = () => {
      void refresh()
    }
    window.addEventListener('hashchange', handleHash)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOnline)
    window.addEventListener('focus', handleFocus)
    if ('BroadcastChannel' in window) {
      broadcast.current = new BroadcastChannel('my-language-journal')
      broadcast.current.onmessage = handleFocus
    }
    if (navigator.storage?.persisted)
      void navigator.storage
        .persisted()
        .then(setPersisted)
        .catch(() => setPersisted(null))
    const cleanup = setupPwa({
      onOfflineReady: () => {
        setOfflineReady(true)
        setPwaError('')
      },
      onUpdateReady: (update) => setPendingUpdate(() => update),
      onError: (error) => {
        setPwaError(errorMessage(error))
        setOfflineReady(false)
      },
    })
    return () => {
      window.removeEventListener('hashchange', handleHash)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOnline)
      window.removeEventListener('focus', handleFocus)
      broadcast.current?.close()
      cleanup()
    }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 4300)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!editor || !isDirty(editor)) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editor])

  async function mutate(action: () => Promise<void>, success?: string): Promise<boolean> {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    try {
      await action()
      // The write has committed. A refresh or cross-tab notification failure
      // must never invite the user to retry an already successful creation.
      try {
        setEntries(await listEntries())
        setLoadError('')
        if (success) setToast(success)
      } catch {
        setLoadError(
          'Your changes were saved, but the list could not be refreshed. Try opening your journal again.',
        )
        setToast('Changes saved. Refresh the journal to see them.')
      }
      try {
        broadcast.current?.postMessage('changed')
      } catch {
        /* A closed channel does not undo a committed write. */
      }
      return true
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  function navigate(next: Page) {
    window.location.hash = next
    setPage(next)
    setSearch('')
    setFilter('all')
  }
  function openEditor(entry?: Entry) {
    setFormError('')
    setDetailId(null)
    setEditor({ original: entry || null, draft: entry ? draftFrom(entry) : { ...EMPTY_DRAFT } })
  }
  function closeEditor() {
    if (!editor || busy) return
    if (isDirty(editor)) setDiscard(true)
    else setEditor(null)
  }
  async function submitEntry(event: FormEvent) {
    event.preventDefault()
    if (!editor || busyRef.current) return
    const validation = validateDraft(editor.draft)
    if (validation) {
      setFormError(validation)
      return
    }
    setFormError('')
    try {
      const entry = editor.original
        ? updateEntry(editor.original, editor.draft)
        : createEntry(editor.draft)
      if (
        await mutate(
          () => saveEntry(entry, editor.original),
          editor.original ? 'Changes saved.' : 'A new entry for your journal.',
        )
      ) {
        setEditor(null)
        setDetailId(entry.id)
      }
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }
  async function toggleFavorite(entry: Entry) {
    setDetailError('')
    try {
      await mutate(
        () =>
          saveEntry(
            { ...entry, favorite: !entry.favorite, updatedAt: new Date().toISOString() },
            entry,
          ),
        entry.favorite ? 'Removed from favorites.' : 'Saved to favorites.',
      )
    } catch (error) {
      const message = `Could not update favorite. ${errorMessage(error)}`
      if (detailId === entry.id) setDetailError(message)
      else setToast(message)
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError('')
    try {
      if (await mutate(() => deleteEntry(deleteTarget.id, deleteTarget), 'Entry deleted.')) {
        setDeleteTarget(null)
        setDetailId(null)
      }
    } catch (error) {
      try {
        const latest = await listEntries()
        setEntries(latest)
        const current = latest.find((entry) => entry.id === deleteTarget.id)
        if (!current) {
          setDeleteTarget(null)
          setDetailId(null)
          setToast('This entry was already removed in another window.')
          return
        }
        setDeleteTarget(current)
      } catch {
        /* Preserve the confirmation if storage is temporarily unavailable. */
      }
      setDeleteError(errorMessage(error))
    }
  }
  async function exportBackup() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      const latest = await listEntries()
      const blob = new Blob([JSON.stringify(createBackup(latest), null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `my-language-journal-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setToast('Backup prepared. Save the JSON file to Files or Downloads.')
    } catch (error) {
      setImportError(errorMessage(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  async function readImport(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!file || busyRef.current) return
    setImportError('')
    setImportNotice('')
    setBusy(true)
    busyRef.current = true
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('This file is too large. Choose a backup smaller than 10 MB.')
      const incoming = parseBackup(await file.text())
      const existing = await listEntries()
      setImportPlan({ incoming, existing, filename: file.name })
    } catch (error) {
      setImportError(errorMessage(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  async function confirmImport() {
    if (!importPlan) return
    setImportNotice('')
    try {
      if (
        await mutate(
          () => mergeEntries(importPlan.incoming, importPlan.existing),
          'Backup imported. Your journal is up to date.',
        )
      )
        setImportPlan(null)
    } catch (error) {
      try {
        setImportPlan({ ...importPlan, existing: await listEntries() })
      } catch {
        /* Keep the current preview if storage is unavailable. */
      }
      setImportNotice(`${errorMessage(error)} Review the preview before trying again.`)
    }
  }
  async function requestPersistence() {
    try {
      if (!navigator.storage?.persist) {
        setStorageNotice(
          'Persistent storage is not available in this browser. Keep regular JSON backups.',
        )
        return
      }
      const granted = await navigator.storage.persist()
      setPersisted(granted)
      setStorageNotice(
        granted
          ? 'Persistent storage is enabled. Keep a JSON backup as well.'
          : 'Your browser did not grant persistent storage. Your journal still works; keep regular JSON backups.',
      )
    } catch {
      setStorageNotice('Could not request persistent storage. You can still export a JSON backup.')
    }
  }

  const status = !online
    ? 'You’re offline'
    : offlineReady
      ? 'Ready for offline use'
      : import.meta.env.DEV
        ? 'Local preview'
        : 'Preparing offline access'
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#library" aria-label="My Language Journal home">
          <span className="brand-mark">
            <BookOpen size={25} strokeWidth={1.6} />
          </span>
          <span>
            My Language
            <br />
            <b>
              Journal<span className="brand-dot">.</span>
            </b>
          </span>
        </a>
        <div className="sidebar-caption">YOUR LITTLE WORLD OF WORDS</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`nav-link ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
              {id !== 'settings' && (
                <span className="nav-count">
                  {id === 'library' ? entries.length : favorites.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="small-leaf">✳</span>
            <p>
              A word today.
              <br />
              <em>A wider world tomorrow.</em>
            </p>
          </div>
          <div className="local-label">
            <ShieldCheck size={16} />
            <span>Personal. Local. Yours.</span>
          </div>
          <span className="version-label">MY LANGUAGE JOURNAL · V1.0</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <BookOpen size={21} />
            <span>
              My Language Journal<span className="brand-dot">.</span>
            </span>
          </div>
          <div className="topbar-caption">A LITTLE SPACE FOR LANGUAGE</div>
          <div className="topbar-right">
            <div className="language-trio">
              <span>EN</span>
              <i>/</i>
              <span>BM</span>
              <i>/</i>
              <span lang="zh">中</span>
            </div>
            <span className={`connection ${!online ? 'is-offline' : ''}`} title={status}>
              {!online ? <WifiOff size={13} /> : <span className="status-dot" />}
              <span>{status}</span>
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {pendingUpdate && (
            <div className="notice update-notice">
              <Info size={18} />
              <span>A fresh version of your journal is ready.</span>
              <button
                className="text-button"
                disabled={!!editor || busy}
                onClick={async () => {
                  try {
                    await pendingUpdate()
                  } catch {
                    setToast('Could not update. Try again when you are online.')
                  }
                }}
              >
                Update now
              </button>
              {editor && <span>Save or close your entry first.</span>}
            </div>
          )}
          {pwaError && (
            <div className="notice warning-notice">
              <CloudOff size={18} />
              <span>{pwaError}</span>
            </div>
          )}
          {page === 'settings' && loadError && (
            <div className="notice warning-notice" role="alert">
              <span>{loadError}</span>
              <button className="text-button" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          )}
          {page !== 'settings' ? (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">
                    {page === 'favorites'
                      ? 'KEEP THE GOOD ONES CLOSE'
                      : 'COLLECT A LITTLE, LEARN A LITTLE'}
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
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setSearch('')}
                    >
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
                      setLoading(true)
                      void refresh()
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
                      <article className={`entry-card ${entry.type}`} key={entry.id}>
                        <div className="card-top">
                          <span className={`type-label ${entry.type}`}>
                            {entry.type === 'word' ? 'Word' : 'Chunk'}
                          </span>
                          <button
                            className={`icon-button favorite-button ${entry.favorite ? 'is-favorite' : ''}`}
                            aria-label={`${entry.favorite ? 'Unfavorite' : 'Favorite'} ${entryTitle(entry)}`}
                            aria-pressed={entry.favorite}
                            onClick={() => void toggleFavorite(entry)}
                            disabled={busy}
                          >
                            <Star
                              size={19}
                              fill={entry.favorite ? 'currentColor' : 'none'}
                              strokeWidth={1.6}
                            />
                          </button>
                        </div>
                        <button
                          className="entry-open"
                          onClick={() => setDetailId(entry.id)}
                          aria-label={`View ${entryTitle(entry)}`}
                        >
                          <h2 lang={entry.english ? 'en' : entry.chinese ? 'zh' : 'ms'}>
                            {entryTitle(entry)}
                          </h2>
                          <div className="entry-translations">
                            {languages
                              .filter(
                                (language) =>
                                  language.key !==
                                  (entry.english ? 'english' : entry.chinese ? 'chinese' : 'malay'),
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
          ) : (
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
                        Save all {entries.length} {entries.length === 1 ? 'entry' : 'entries'},
                        notes, and favorites in a JSON file.
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
                      onChange={(event) => void readImport(event.target.files?.[0])}
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
                      Local storage isn’t a permanent backup. Clearing website data or reinstalling
                      can remove your journal. Export regularly, especially before changing devices.
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
                      <strong>Add to Home Screen</strong>. Enable <strong>Open as Web App</strong>{' '}
                      if shown.
                    </p>
                    <p className="muted">
                      Open it once online, then check that offline access is ready. Safari and the
                      installed app may have separate journals; use JSON export and import to move
                      your entries.
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
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={1.7} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToast('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {detail && !editor && (
        <Modal
          title="A little discovery"
          eyebrow="FROM YOUR JOURNAL"
          onClose={() => setDetailId(null)}
          className="detail-modal"
          busy={busy}
        >
          <div className="detail-content">
            {detailError && (
              <p className="form-error" role="alert">
                {detailError}
              </p>
            )}
            <div className="detail-meta">
              <span className={`type-label ${detail.type}`}>
                {detail.type === 'word' ? 'Word' : 'Chunk'}
              </span>
              <button
                className={`favorite-detail ${detail.favorite ? 'is-favorite' : ''}`}
                onClick={() => void toggleFavorite(detail)}
                disabled={busy}
                aria-pressed={detail.favorite}
              >
                <Star size={18} fill={detail.favorite ? 'currentColor' : 'none'} />
                {detail.favorite ? 'Favorited' : 'Add to favorites'}
              </button>
            </div>
            <div className="detail-languages">
              {languages.map((language) => (
                <section key={language.key}>
                  <div className="detail-language-label">
                    <span className="language-code">{language.short}</span>
                    <span>{language.label}</span>
                  </div>
                  <p
                    lang={language.lang}
                    className={!detail[language.key] ? 'translation-missing' : ''}
                  >
                    {detail[language.key] || 'A translation for another day.'}
                  </p>
                </section>
              ))}
            </div>
            {detail.note && (
              <section className="detail-note">
                <h3>
                  <StickyNote size={16} />A note to remember
                </h3>
                <p>{detail.note}</p>
              </section>
            )}
            <div className="entry-dates">
              <span>Added {formatDate(detail.createdAt, true)}</span>
              <span>Edited {formatDate(detail.updatedAt, true)}</span>
            </div>
          </div>
          <footer className="modal-footer">
            <button
              className="button danger-text"
              onClick={() => {
                setDeleteError('')
                setDeleteTarget(detail)
              }}
              disabled={busy}
            >
              <Trash2 size={17} />
              Delete
            </button>
            <button className="button primary" onClick={() => openEditor(detail)} disabled={busy}>
              Edit entry
              <ArrowRight size={17} />
            </button>
          </footer>
        </Modal>
      )}

      {editor && (
        <Modal
          title={editor.original ? 'A little fine-tuning.' : 'What did you discover?'}
          eyebrow={editor.original ? 'EDIT YOUR ENTRY' : 'A NEW PAGE IN YOUR JOURNAL'}
          onClose={closeEditor}
          className="editor-modal"
          busy={busy}
        >
          <form onSubmit={(event) => void submitEntry(event)}>
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
                      onClick={() => setEditor({ ...editor, draft: { ...editor.draft, type } })}
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
                    onChange={(event) => {
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, [language.key]: event.target.value },
                      })
                      setFormError('')
                    }}
                  />
                </label>
              ))}
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
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, note: event.target.value } })
                  }
                />
              </label>
              {formError && (
                <p ref={formErrorRef} role="alert" className="form-error">
                  {formError}
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button type="button" className="button plain" onClick={closeEditor} disabled={busy}>
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
      )}

      {discard && (
        <Modal title="Leave this page?" onClose={() => setDiscard(false)} className="confirm-modal">
          <div className="confirm-content">
            <p>Your unsaved changes will be lost.</p>
          </div>
          <footer className="modal-footer">
            <button className="button secondary" onClick={() => setDiscard(false)}>
              Keep writing
            </button>
            <button
              className="button danger"
              onClick={() => {
                setDiscard(false)
                setEditor(null)
              }}
            >
              Discard changes
            </button>
          </footer>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Delete this entry?"
          eyebrow="MAKE A LITTLE ROOM"
          onClose={() => setDeleteTarget(null)}
          className="confirm-modal"
          busy={busy}
        >
          <div className="confirm-content">
            <p>
              <strong className="delete-entry-name">“{entryTitle(deleteTarget)}”</strong> will be
              removed from your journal and favorites. This can’t be undone.
            </p>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              Keep entry
            </button>
            <button className="button danger" onClick={() => void confirmDelete()} disabled={busy}>
              {busy ? <LoaderCircle className="spinning" size={16} /> : <Trash2 size={16} />}Delete
              entry
            </button>
          </footer>
        </Modal>
      )}
      {importPlan && (
        <Modal
          title="Bring your words home."
          eyebrow="REVIEW YOUR BACKUP"
          onClose={() => {
            setImportPlan(null)
            setImportNotice('')
          }}
          className="import-modal"
          busy={busy}
        >
          <div className="import-content">
            <div className="import-file">
              <FileJson size={24} />
              <div>
                <strong>{importPlan.filename}</strong>
                <span>{importPlan.incoming.length} entries · JSON backup v1</span>
              </div>
            </div>
            <ImportSummary plan={importPlan} />
            <p className="import-explanation">
              New IDs are added. Matching IDs with changes are replaced by the backup’s version,
              including translations, notes, and favorites. Entries outside this backup stay in your
              journal.
            </p>
            {previewImport(importPlan.existing, importPlan.incoming).updated > 0 && (
              <div className="backup-note">
                <Info size={17} />
                <p>
                  This backup will replace existing entries. Export your current journal first if
                  you want to keep both versions.
                </p>
              </div>
            )}
            {importNotice && (
              <p className="form-error" role="alert">
                {importNotice}
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setImportPlan(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button primary" onClick={() => void confirmImport()} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spinning" size={16} />
              ) : (
                <ArrowUpFromLine size={17} />
              )}
              Confirm import
            </button>
          </footer>
        </Modal>
      )}
    </div>
  )
}

function ImportSummary({ plan }: { plan: ImportPlan }) {
  const summary = previewImport(plan.existing, plan.incoming)
  return (
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
  )
}

export default App
