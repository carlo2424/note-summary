import { useMemo, useState } from 'react'
import { db, type Event, type Note } from '../db'
import { useDexieLiveQuery } from '../hooks/useDexieLiveQuery'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import { noteSummaryBucket } from '../utils/summaryCategory'
import { hasPersistedGoogleCalendarLink } from '../utils/googleCalendar'
import { sentenceCase } from '../utils/format'
import {
  buildCalendarioRows,
  formatCalendarioExpandedMeta,
  formatCalendarioHomeLine,
  readCalendarioVisibleIds,
  writeCalendarioVisibleIds,
  type CalendarioRow,
} from '../utils/dashboardCalendario'

const PASTEL = {
  calendario: 'border-violet-200 bg-[#E4DCF8]',
  note: 'border-amber-200 bg-[#FEF5C1]',
  trading: 'border-sky-200 bg-[#D4E6F8]',
  crypto: 'border-emerald-200 bg-[#D5F0E2]',
} as const

interface DashboardHomeProps {
  onEditEvent: (event: Event) => void
  onEditNote: (note: Note) => void
  onGoToEvents: () => void
  onGoToNotes: () => void
  onGoToTrading: () => void
  onGoToCrypto: () => void
  onOpenSettings: () => void
}

function CategoryCard({
  title,
  className,
  lines,
  empty,
  onClick,
}: {
  title: string
  className: string
  lines: string[]
  empty: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[132px] w-full flex-col gap-1 rounded-xl border p-2.5 text-left ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
        {title}
      </span>
      {lines.length === 0 ? (
        <span className="text-xs text-slate-600">{empty}</span>
      ) : (
        lines.map((line, index) => (
          <span
            key={`${line}-${index}`}
            className="line-clamp-2 break-words text-xs text-slate-800"
          >
            {line}
          </span>
        ))
      )}
    </button>
  )
}

export function DashboardHome({
  onEditEvent,
  onEditNote,
  onGoToEvents,
  onGoToNotes,
  onGoToTrading,
  onGoToCrypto,
  onOpenSettings,
}: DashboardHomeProps) {
  const events = useDexieLiveQuery(() => db.events.toArray())
  const notes = useDexieLiveQuery(() => db.notes.toArray())
  const google = useGoogleCalendar(true)

  const [expandedCal, setExpandedCal] = useState(false)
  const [visibleRev, setVisibleRev] = useState(0)

  const rows = useMemo(
    () => buildCalendarioRows(events ?? [], notes ?? [], google.events),
    [events, notes, google.events],
  )

  const allIds = useMemo(() => rows.map((r) => r.id), [rows])

  const visibleIds = useMemo(() => {
    void visibleRev
    return readCalendarioVisibleIds(allIds)
  }, [allIds, visibleRev])

  function setVisible(id: string, checked: boolean) {
    const next = new Set(visibleIds)
    if (checked) next.add(id)
    else next.delete(id)
    writeCalendarioVisibleIds(next)
    setVisibleRev((v) => v + 1)
  }

  const visibleRows = rows.filter((r) => visibleIds.has(r.id))

  function openRow(row: CalendarioRow) {
    if (row.kind === 'event' && row.event) onEditEvent(row.event)
    else if (row.kind === 'note' && row.note) onEditNote(row.note)
    else if (row.kind === 'google' && row.google?.htmlLink) {
      window.open(row.google.htmlLink, '_blank', 'noreferrer')
    }
  }

  if (expandedCal) {
    return (
      <div className="max-w-full space-y-3 overflow-x-hidden rounded-2xl bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Calendario</h2>
          <button
            type="button"
            onClick={() => setExpandedCal(false)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
          >
            Chiudi
          </button>
        </div>
        {google.error && (
          <p className="text-xs text-rose-600">{google.error}</p>
        )}
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nessun impegno. Aggiungi da Impegni o collega Google in Impostazioni.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={visibleIds.has(row.id)}
                  onChange={(e) => setVisible(row.id, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                  aria-label={`Mostra in home: ${row.title}`}
                />
                <button
                  type="button"
                  onClick={() => openRow(row)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="break-words text-sm font-semibold text-violet-900">
                    {formatCalendarioExpandedMeta(row)}
                  </p>
                  <p className="break-words text-sm font-medium text-slate-800">
                    {sentenceCase(row.title)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onGoToEvents}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white"
        >
          Apri impegni
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-2xl bg-white p-3">
      {!google.connected &&
        !hasPersistedGoogleCalendarLink() &&
        google.events.length === 0 && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-900"
        >
          Collega il calendario Google in Impostazioni per vedere gli eventi
          veri nella card Calendario.
        </button>
      )}
      {hasPersistedGoogleCalendarLink() && !google.connected && google.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Calendario Google collegato in memoria: aggiornamento in corso. Se
          serve, riapri Impostazioni e tocca «Collega calendario».
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setExpandedCal(true)}
          className={`flex min-h-[132px] w-full flex-col gap-1 rounded-xl border p-2.5 text-left ${PASTEL.calendario}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Calendario
          </span>
          {visibleRows.length === 0 ? (
            <span className="text-xs text-slate-600">
              {rows.length === 0
                ? 'Nessun impegno'
                : 'Apri e spunta le voci da mostrare'}
            </span>
          ) : (
            visibleRows.map((row) => (
              <span
                key={row.id}
                className="line-clamp-2 break-words text-xs text-slate-800"
              >
                {formatCalendarioHomeLine(row)}
              </span>
            ))
          )}
        </button>

        <CategoryCard
          title="Note"
          className={PASTEL.note}
          onClick={onGoToNotes}
          empty="Nessuna nota"
          lines={(notes ?? [])
            .filter((note) => noteSummaryBucket(note) === 'note')
            .slice(0, 4)
            .map((note) => sentenceCase(note.title))}
        />
        <CategoryCard
          title="Trading"
          className={PASTEL.trading}
          onClick={onGoToTrading}
          empty="Nessuna voce"
          lines={(notes ?? [])
            .filter((note) => noteSummaryBucket(note) === 'trading')
            .slice(0, 4)
            .map((note) => sentenceCase(note.title))}
        />
        <CategoryCard
          title="Crypto"
          className={PASTEL.crypto}
          onClick={onGoToCrypto}
          empty="Nessuna voce"
          lines={(notes ?? [])
            .filter((note) => noteSummaryBucket(note) === 'crypto')
            .slice(0, 4)
            .map((note) => sentenceCase(note.title))}
        />
      </div>
    </div>
  )
}