import { CloudOff, Info } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { LibraryView } from './components/LibraryView'
import { SettingsView } from './components/SettingsView'
import { EntryEditor } from './components/EntryEditor'
import { EntryDetails } from './components/EntryDetails'
import { DeleteConfirmation, DiscardConfirmation } from './components/EntryConfirmations'
import { ImportDialog } from './components/ImportDialog'
import { useAppStatus } from './hooks/useAppStatus'
import { useJournalData } from './hooks/useJournalData'
import { useEntryWorkflow } from './hooks/useEntryWorkflow'
import { useBackupWorkflow } from './hooks/useBackupWorkflow'

export default function App() {
  const app = useAppStatus()
  const data = useJournalData(app.setToast)
  const entry = useEntryWorkflow(data, app.setToast)
  const backup = useBackupWorkflow(data, app.setToast)
  const favorites = data.entries.filter((item) => item.favorite).length

  return (
    <AppShell
      page={app.page}
      entryCount={data.entries.length}
      favoriteCount={favorites}
      online={app.online}
      status={app.status}
      toast={app.toast}
      onDismissToast={() => app.setToast('')}
      dialogs={
        <>
          {entry.detail && !entry.editor && (
            <EntryDetails
              entry={entry.detail}
              busy={data.busy}
              error={entry.detailError}
              notice={entry.detailNotice}
              onClose={entry.closeDetails}
              onFavorite={entry.toggleFavorite}
              onEdit={entry.openEditor}
              onDelete={entry.requestDelete}
            />
          )}
          {entry.editor && (
            <EntryEditor
              editor={entry.editor}
              entries={data.entries}
              busy={data.busy}
              error={entry.formError}
              onChange={entry.changeDraft}
              onClose={entry.closeEditor}
              onSubmit={entry.submitEntry}
            />
          )}
          {entry.discard && (
            <DiscardConfirmation onKeep={entry.keepWriting} onDiscard={entry.discardChanges} />
          )}
          {entry.deleteTarget && (
            <DeleteConfirmation
              entry={entry.deleteTarget}
              busy={data.busy}
              error={entry.deleteError}
              onCancel={entry.cancelDelete}
              onConfirm={entry.confirmDelete}
            />
          )}
          {backup.plan && (
            <ImportDialog
              plan={backup.plan}
              mode={backup.mode}
              busy={data.busy}
              notice={backup.notice}
              replaceConfirmation={backup.replaceConfirmation}
              onModeChange={backup.changeMode}
              onCancel={backup.cancelImport}
              onContinue={backup.continueImport}
              onConfirmReplace={backup.confirmReplace}
              onKeepJournal={backup.keepJournal}
            />
          )}
        </>
      }
    >
      {app.pendingUpdate && (
        <div className="notice update-notice">
          <Info size={18} />
          <span>A fresh version of your journal is ready.</span>
          <button
            className="text-button"
            disabled={!!entry.editor || data.busy}
            onClick={async () => {
              try {
                await app.pendingUpdate?.()
              } catch {
                app.setToast('Could not update. Try again when you are online.')
              }
            }}
          >
            Update now
          </button>
          {entry.editor && <span>Save or close your entry first.</span>}
        </div>
      )}
      {app.pwaError && (
        <div className="notice warning-notice">
          <CloudOff size={18} />
          <span>{app.pwaError}</span>
        </div>
      )}
      {app.page === 'settings' && data.loadError && (
        <div className="notice warning-notice" role="alert">
          <span>{data.loadError}</span>
          <button className="text-button" onClick={() => void data.refresh()}>
            Try again
          </button>
        </div>
      )}
      {app.page === 'settings' ? (
        <SettingsView
          entryCount={data.entries.length}
          loading={data.loading}
          loadError={data.loadError}
          busy={data.busy}
          importError={backup.error}
          offlineReady={app.offlineReady}
          pwaError={app.pwaError}
          persisted={app.persisted}
          storageNotice={app.storageNotice}
          exportBackup={backup.exportBackup}
          readImport={backup.readImport}
          requestPersistence={app.requestPersistence}
        />
      ) : (
        <LibraryView
          key={app.page}
          page={app.page}
          entries={data.entries}
          loading={data.loading}
          loadError={data.loadError}
          busy={data.busy}
          openEditor={entry.openEditor}
          toggleFavorite={entry.toggleFavorite}
          setDetailId={entry.openDetails}
          navigate={app.navigate}
          refresh={data.refresh}
        />
      )}
    </AppShell>
  )
}
