import { useEffect, useState } from 'react'
import {
  Archive,
  CalendarDays,
  CircleDollarSign,
  Home,
  Plus,
  Settings,
  StickyNote,
  TrendingUp,
} from 'lucide-react'
import { AddChooser } from './components/AddChooser'
import { ArchiveList } from './components/ArchiveList'
import { formatToday } from './utils/format'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RecoveryScreen } from './components/RecoveryScreen'
import { OfflineStatus } from './components/OfflineStatus'
import { ExpenseForm } from './components/ExpenseForm'
import { EventForm } from './components/EventForm'
import { EventList } from './components/EventList'
import { DashboardHome } from './components/DashboardHome'
import type { SummaryAddCategory } from './components/AddChooser'
import type { SummaryBucket } from './utils/summaryCategory'
import { Modal } from './components/Modal'
import { NoteForm } from './components/NoteForm'
import { NoteList } from './components/NoteList'
import { SettingsPanel } from './components/SettingsPanel'
import { VoiceCreateButton } from './components/VoiceCreateButton'
import { BackupReminderBanner } from './components/BackupReminderBanner'
import { DataLossBanner } from './components/DataLossBanner'
import { StorageProtectionBanner } from './components/StorageProtectionBanner'
import { isStorageProtectionBannerDismissed } from './utils/storageProtectionBanner'
import { hasBackupableData, scheduleAutoSnapshot } from './utils/backup'
import { flushBeforePageLeave } from './utils/autoCloudSync'
import { shouldShowBackupReminder } from './utils/backupReminder'
import {
  detectPossibleDataLoss,
  updateDataFingerprint,
  type DataFingerprint,
} from './utils/dataFingerprint'
import { ensurePersistentStorage, isStoragePersisted } from './utils/storagePersistence'
import { useAutomatedEventSync } from './hooks/useAutomatedEventSync'
import { type Event, type Expense, type Note } from './db'
import type { NoteKind } from './utils/noteKind'
import { resolveNoteKind } from './utils/noteKind'

type Section =
  | 'home'
  | 'notes'
  | 'events'
  | 'trading'
  | 'crypto'
  | 'archive'

const ALL_SECTIONS: Section[] = [
  'home',
  'notes',
  'events',
  'trading',
  'crypto',
  'archive',
]

function isSection(value: string): value is Section {
  return ALL_SECTIONS.includes(value as Section)
}

function readSectionFromHash(): Section {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'expenses') return 'home'
  return isSection(hash) ? hash : 'home'
}

const sections: Record<
  Section,
  { label: string; icon: typeof Home; title: string; description: string }
> = {
  home: {
    label: 'Home',
    icon: Home,
    title: 'Home',
    description: '',
  },
  notes: {
    label: 'Note',
    icon: StickyNote,
    title: 'Note e liste',
    description: 'Appunti testuali e liste to-do con spunte.',
  },
  events: {
    label: 'Calendario',
    icon: CalendarDays,
    title: 'Calendario',
    description: 'Impegni locali e Google.',
  },
  trading: {
    label: 'Trading',
    icon: TrendingUp,
    title: 'Trading',
    description: 'Appunti trading (in arrivo).',
  },
  crypto: {
    label: 'Crypto',
    icon: CircleDollarSign,
    title: 'Crypto',
    description: 'Appunti crypto (in arrivo).',
  },
  archive: {
    label: 'Archivio',
    icon: Archive,
    title: 'Archivio',
    description: 'Elementi archiviati, recuperabili in qualsiasi momento.',
  },
}

function App() {
  const [activeSection, setActiveSection] = useState<Section>(readSectionFromHash)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showBackupReminder, setShowBackupReminder] = useState(false)
  const [showStorageProtection, setShowStorageProtection] = useState(false)
  const [dataLossPrevious, setDataLossPrevious] =
    useState<DataFingerprint | null>(null)
  const [showAddChooser, setShowAddChooser] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>()
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>()
  const [editingNote, setEditingNote] = useState<Note | undefined>()
  const [newNoteKind, setNewNoteKind] = useState<NoteKind>('text')
  const [noteBucket, setNoteBucket] = useState<SummaryBucket>('note')
  const [defaultAreaName, setDefaultAreaName] = useState<string | undefined>()

  const current = sections[activeSection]
  const CurrentIcon = current.icon
  useAutomatedEventSync()

  const menuRows: { key: Section | 'settings'; label: string }[][] = [
    [
      { key: 'home', label: 'Home' },
      { key: 'notes', label: 'Note' },
      { key: 'events', label: 'Calendario' },
      { key: 'trading', label: 'Trading' },
    ],
    [
      { key: 'crypto', label: 'Crypto' },
      { key: 'archive', label: 'Archivio' },
      { key: 'settings', label: 'Impostazioni' },
    ],
  ]

  function clearDefaultArea() {
    setDefaultAreaName(undefined)
  }

  function openNewEvent() {
    setEditingEvent(undefined)
    setShowEventForm(true)
  }

  function openEditEvent(event: Event) {
    setEditingEvent(event)
    setShowEventForm(true)
  }

  function openEditExpense(expense: Expense) {
    setEditingExpense(expense)
    setShowExpenseForm(true)
  }

  function openNewNote(kind: NoteKind = 'text') {
    setEditingNote(undefined)
    setNewNoteKind(kind)
    setShowNoteForm(true)
  }

  function openEditNote(note: Note) {
    setEditingNote(note)
    setNewNoteKind(resolveNoteKind(note))
    setShowNoteForm(true)
  }

  function openAddChooser() {
    setShowAddChooser(true)
  }

  function closeAddChooser() {
    setShowAddChooser(false)
    if (!showNoteForm && !showEventForm && !showExpenseForm) {
      clearDefaultArea()
    }
  }

  function addFromChooser(category: SummaryAddCategory) {
    setShowAddChooser(false)
    if (category === 'calendario') {
      navigateSection('events')
      openNewEvent()
      return
    }
    const bucket: SummaryBucket =
      category === 'trading' || category === 'crypto' ? category : 'note'
    setNoteBucket(bucket)
    navigateSection(bucket === 'note' ? 'notes' : bucket)
    openNewNote('text')
  }

  function closeNoteForm() {
    setShowNoteForm(false)
    setEditingNote(undefined)
    clearDefaultArea()
  }

  function closeEventForm() {
    setShowEventForm(false)
    setEditingEvent(undefined)
    clearDefaultArea()
  }

  function closeExpenseForm() {
    setShowExpenseForm(false)
    setEditingExpense(undefined)
    clearDefaultArea()
  }

  function handleNoteSaved() {
    closeNoteForm()
  }

  function handleEventSaved() {
    closeEventForm()
  }

  function handleExpenseSaved() {
    closeExpenseForm()
  }

  function handleAddClick() {
    openAddChooser()
  }

  const showAddButton = activeSection !== 'archive'

  useEffect(() => {
    let cancelled = false

    async function checkStartupSafety() {
      const loss = await detectPossibleDataLoss()
      if (!cancelled && loss.lost && loss.previous) {
        setDataLossPrevious(loss.previous)
      }

      await updateDataFingerprint()

      if (cancelled) return

      await ensurePersistentStorage()
      const persisted = await isStoragePersisted()
      if (
        !persisted &&
        !isStorageProtectionBannerDismissed() &&
        !loss.lost
      ) {
        setShowStorageProtection(true)
      }
    }

    void checkStartupSafety()

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void ensurePersistentStorage()
        void updateDataFingerprint()
      } else {
        flushBeforePageLeave()
      }
    }

    function onPageHide() {
      flushBeforePageLeave()
    }

    // Rete di sicurezza: snapshot periodico mentre l'app è aperta.
    const snapshotInterval = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') {
          scheduleAutoSnapshot()
          flushBeforePageLeave()
        }
      },
      2 * 60 * 1000,
    )

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      window.clearInterval(snapshotInterval)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function checkBackupReminder() {
      if (!shouldShowBackupReminder()) {
        if (!cancelled) setShowBackupReminder(false)
        return
      }
      const hasData = await hasBackupableData()
      if (!cancelled) setShowBackupReminder(hasData)
    }
    void checkBackupReminder()
    return () => {
      cancelled = true
    }
  }, [showSettings])

  function dismissBackupReminder() {
    setShowBackupReminder(false)
  }

  function openSettingsFromBackup() {
    setShowSettings(true)
  }

  function navigateSection(next: Section) {
    if (next === activeSection) return

    if (next === 'home') {
      setActiveSection('home')
      window.history.replaceState(
        { section: 'home' },
        '',
        `${window.location.pathname}${window.location.search}`,
      )
      return
    }

    setActiveSection(next)
    window.history.pushState({ section: next }, '', `#${next}`)
  }

  useEffect(() => {
    const initial = readSectionFromHash()
    window.history.replaceState(
      { section: initial },
      '',
      initial === 'home'
        ? `${window.location.pathname}${window.location.search}`
        : `#${initial}`,
    )

    function onPopState() {
      setActiveSection('home')
      window.history.replaceState(
        { section: 'home' },
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <ErrorBoundary
      fallback={(error) => (
        <RecoveryScreen
          title="Qualcosa è andato storto"
          detail={error.message}
        />
      )}
    >
      <div className="mx-auto flex min-h-svh max-w-lg flex-col bg-slate-50">
        <OfflineStatus />
        {dataLossPrevious && (
          <DataLossBanner
            previous={dataLossPrevious}
            onOpenSettings={openSettingsFromBackup}
            onRestored={() => {
              setDataLossPrevious(null)
              void updateDataFingerprint()
            }}
            onDismiss={() => setDataLossPrevious(null)}
          />
        )}
        {showStorageProtection && !dataLossPrevious && (
          <StorageProtectionBanner
            onOpenSettings={openSettingsFromBackup}
            onDismiss={() => setShowStorageProtection(false)}
          />
        )}
        {showBackupReminder && (
          <BackupReminderBanner
            onOpenSettings={openSettingsFromBackup}
            onDismiss={dismissBackupReminder}
          />
        )}

        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Note Summary
              </h1>
              <p className="text-xs capitalize text-slate-500">{formatToday()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Impostazioni"
              >
                <Settings className="h-5 w-5" />
              </button>
              {showAddButton && (
                <button
                  type="button"
                  onClick={handleAddClick}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 active:scale-95"
                  aria-label="Aggiungi"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main
          className={`min-h-0 flex-1 ${
            activeSection === 'home'
              ? 'flex flex-col px-4 py-4'
              : 'px-4 py-6'
          }`}
        >
          {activeSection !== 'home' && (
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <CurrentIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-slate-900">
                  {current.title}
                </h2>
                {current.description ? (
                  <p className="text-sm text-slate-500">{current.description}</p>
                ) : null}
              </div>
            </div>
          )}

          {activeSection === 'home' && (
            <DashboardHome
              onEditEvent={openEditEvent}
              onEditNote={openEditNote}
              onGoToEvents={() => navigateSection('events')}
              onGoToNotes={() => navigateSection('notes')}
              onGoToTrading={() => navigateSection('trading')}
              onGoToCrypto={() => navigateSection('crypto')}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
          {activeSection === 'notes' && (
            <NoteList bucket="note" onEdit={openEditNote} />
          )}
          {activeSection === 'events' && (
            <EventList onEdit={openEditEvent} onEditNote={openEditNote} />
          )}
          {activeSection === 'trading' && (
            <NoteList bucket="trading" onEdit={openEditNote} />
          )}
          {activeSection === 'crypto' && (
            <NoteList bucket="crypto" onEdit={openEditNote} />
          )}
          {activeSection === 'archive' && <ArchiveList />}
        </main>

        {activeSection === 'home' && (
          <div className="relative z-20 flex justify-center border-t border-transparent bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-0.5 pt-1">
            <VoiceCreateButton
              onEditNote={openEditNote}
              onEditEvent={openEditEvent}
              onEditExpense={openEditExpense}
            />
          </div>
        )}

        <nav
          className="sticky bottom-0 z-30 bg-[#4b5563] px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2"
          aria-label="Menu Note Summary: testi, senza icone"
        >
          <div className="flex flex-col gap-1">
            {menuRows.map((row) => (
              <div key={row[0].key} className="flex gap-1">
                {row.map((item) => {
                  const isActive =
                    item.key === 'settings'
                      ? showSettings
                      : activeSection === item.key && !showSettings
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === 'settings') setShowSettings(true)
                        else navigateSection(item.key)
                      }}
                      className={`min-w-0 flex-1 rounded-md px-0.5 py-1.5 text-center text-xs leading-4 ${
                        isActive
                          ? 'bg-[#2563eb] font-semibold text-white'
                          : 'bg-transparent font-normal text-zinc-100'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </nav>
      </div>

      {showAddChooser && (
        <Modal
          title="Nuova voce"
          onClose={closeAddChooser}
        >
          <AddChooser onChoose={addFromChooser} />
        </Modal>
      )}

      {showEventForm && (
        <Modal
          title={editingEvent ? 'Modifica calendario' : 'Nuova voce Calendario'}
          onClose={closeEventForm}
        >
          <EventForm
            event={editingEvent}
            defaultAreaName={editingEvent ? undefined : defaultAreaName}
            onSave={handleEventSaved}
            onClose={closeEventForm}
          />
        </Modal>
      )}

      {showSettings && (
        <Modal title="Impostazioni" onClose={() => setShowSettings(false)}>
          <SettingsPanel onBackupDone={dismissBackupReminder} />
        </Modal>
      )}

      {showNoteForm && (
        <Modal
          title={
            editingNote
              ? resolveNoteKind(editingNote) === 'checklist'
                ? 'Modifica lista'
                : 'Modifica nota'
              : noteBucket === 'trading'
                ? 'Nuova voce Trading'
                : noteBucket === 'crypto'
                  ? 'Nuova voce Crypto'
                  : 'Nuova voce Note'
          }
          onClose={closeNoteForm}
        >
          <NoteForm
            note={editingNote}
            defaultKind={newNoteKind}
            defaultAreaName={editingNote ? undefined : defaultAreaName}
            summaryCategory={editingNote ? undefined : noteBucket}
            onSave={handleNoteSaved}
            onClose={closeNoteForm}
          />
        </Modal>
      )}

      {showExpenseForm && (
        <Modal
          title={editingExpense ? 'Modifica spesa' : 'Nuova spesa'}
          onClose={closeExpenseForm}
        >
          <ExpenseForm
            expense={editingExpense}
            defaultAreaName={editingExpense ? undefined : defaultAreaName}
            onSave={handleExpenseSaved}
            onClose={closeExpenseForm}
          />
        </Modal>
      )}
    </ErrorBoundary>
  )
}

export default App
