import type { Entry, EntryDraft } from './entries'

export type Page = 'library' | 'favorites' | 'settings'
export type Filter = 'all' | 'word' | 'chunk'
export type EditorState = { original: Entry | null; draft: EntryDraft }
export type ImportMode = 'merge' | 'replace'
export type ImportPlan = { incoming: Entry[]; existing: Entry[]; filename: string }
export const EMPTY_DRAFT: EntryDraft = {
  type: 'word',
  english: '',
  chinese: '',
  malay: '',
  note: '',
}

export const languages = [
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

export function currentPage(): Page {
  const hash = window.location.hash.slice(1)
  return hash === 'favorites' || hash === 'settings' ? hash : 'library'
}

export function entryTitle(entry: Entry) {
  return entry.english || entry.chinese || entry.malay
}
export function formatDate(date: string, long = false) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  }).format(new Date(date))
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
export function draftFrom(entry: Entry): EntryDraft {
  return {
    type: entry.type,
    english: entry.english,
    chinese: entry.chinese,
    malay: entry.malay,
    note: entry.note,
  }
}
export function isDirty(editor: EditorState) {
  return (
    JSON.stringify(editor.draft) !==
    JSON.stringify(editor.original ? draftFrom(editor.original) : EMPTY_DRAFT)
  )
}
