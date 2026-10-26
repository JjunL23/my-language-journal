import type { ReactNode } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Library,
  Settings,
  ShieldCheck,
  Star,
  WifiOff,
  X,
} from 'lucide-react'
import type { Page } from '../lib/ui'
const navigation = [
  { id: 'library' as const, label: 'Library', icon: Library },
  { id: 'favorites' as const, label: 'Favorites', icon: Star },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
]
interface Props {
  page: Page
  entryCount: number
  favoriteCount: number
  online: boolean
  status: string
  toast: string
  onDismissToast: () => void
  children: ReactNode
  dialogs: ReactNode
}
export function AppShell({
  page,
  entryCount,
  favoriteCount,
  online,
  status,
  toast,
  onDismissToast,
  children,
  dialogs,
}: Props) {
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
                <span className="nav-count">{id === 'library' ? entryCount : favoriteCount}</span>
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
          {children}
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
              onClick={() => onDismissToast()}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {dialogs}
    </div>
  )
}
