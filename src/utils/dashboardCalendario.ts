import { appStorageKey } from '../constants/storageScope'
import type { Event, Note } from '../db'
import { filterEventImpegni, filterNoteImpegni } from './impegno'
import {
  compareDeadlineIso,
  eventDeadlineIso,
  noteKeyDate,
} from './homeSpotlight'
import type { GoogleCalendarEvent } from './googleCalendar'
import { homeDeadlineWhenWord } from './homeSpotlight'

export type CalendarioRowKind = 'event' | 'note' | 'google'

export type CalendarioRow = {
  id: string
  kind: CalendarioRowKind
  title: string
  sortIso: string
  subtitle: string
  event?: Event
  note?: Note
  google?: GoogleCalendarEvent
}

const VISIBLE_KEY = appStorageKey('dashboard-cal-visible')

export function calendarioRowId(
  kind: CalendarioRowKind,
  rawId: string | number,
): string {
  return `${kind}-${rawId}`
}

export function buildCalendarioRows(
  events: Event[],
  notes: Note[],
  googleEvents: GoogleCalendarEvent[],
): CalendarioRow[] {
  const rows: CalendarioRow[] = []

  for (const item of filterEventImpegni(events)) {
    if (item.id == null) continue
    const sortIso = eventDeadlineIso(item)
    rows.push({
      id: calendarioRowId('event', item.id),
      kind: 'event',
      title: item.title,
      sortIso,
      subtitle: sortIso,
      event: item,
    })
  }

  for (const item of filterNoteImpegni(notes)) {
    if (item.id == null) continue
    const iso = noteKeyDate(item)
    if (!iso) continue
    rows.push({
      id: calendarioRowId('note', item.id),
      kind: 'note',
      title: item.title,
      sortIso: iso,
      subtitle: iso,
      note: item,
    })
  }

  for (const item of googleEvents) {
    rows.push({
      id: calendarioRowId('google', item.id),
      kind: 'google',
      title: item.title,
      sortIso: item.startDate,
      subtitle: `Google · ${item.whenLabel}`,
      google: item,
    })
  }

  rows.sort((a, b) =>
    compareDeadlineIso(a.sortIso, b.sortIso, a.title.localeCompare(b.title, 'it-IT')),
  )

  return rows
}

function readVisibleRaw(): string[] | null {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return null
  }
}

export function readCalendarioVisibleIds(allIds: string[]): Set<string> {
  const stored = readVisibleRaw()
  if (stored !== null) {
    const set = new Set(stored.filter((id) => allIds.includes(id)))
    if (set.size > 0) return set
  }
  return new Set(allIds.slice(0, 3))
}

/** Data sempre visibile in card Home: giorno + mese; anno se diverso da quello corrente. */
export function formatCalendarioCardDate(iso: string): string {
  const nowY = new Date().getFullYear()
  const d = new Date(`${iso}T12:00:00`)
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
  }
  if (d.getFullYear() !== nowY) opts.year = 'numeric'
  return d.toLocaleDateString('it-IT', opts)
}

/** Riga compatta Home: data in evidenza, poi titolo (e ora Google se c’è). */
export function formatCalendarioHomeLine(row: CalendarioRow): string {
  const date = formatCalendarioCardDate(row.sortIso)
  const title = row.title.trim()
  if (row.kind === 'google') {
    const time = row.google?.whenLabel?.trim()
    const timePart = time && time !== 'tutto il giorno' ? ` · ${time}` : ''
    return `${date}${timePart} · ${title}`
  }
  const when = homeDeadlineWhenWord(row.sortIso)
  const whenPart = when ? `${when} · ` : ''
  return `${whenPart}${date} · ${title}`
}

/** Dettaglio espanso: data su riga dedicata, sotto titolo e meta. */
export function formatCalendarioExpandedMeta(row: CalendarioRow): string {
  const date = formatCalendarioCardDate(row.sortIso)
  if (row.kind === 'google') {
    const time = row.google?.whenLabel?.trim() ?? ''
    const parts = [date]
    if (time) parts.push(time)
    parts.push('Google')
    return parts.join(' · ')
  }
  const when = homeDeadlineWhenWord(row.sortIso)
  return when ? `${when} · ${date}` : date
}

export function writeCalendarioVisibleIds(ids: Iterable<string>) {
  try {
    localStorage.setItem(VISIBLE_KEY, JSON.stringify([...ids]))
  } catch {
    // quota
  }
}