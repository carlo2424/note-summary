import { appStorageKey } from '../constants/storageScope'
import type { Event, Note } from '../db'
import { filterEventImpegni, filterNoteImpegni } from './impegno'
import {
  compareDeadlineIso,
  eventDeadlineIso,
  noteKeyDate,
} from './homeSpotlight'
import type { GoogleCalendarEvent } from './googleCalendar'

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

export function writeCalendarioVisibleIds(ids: Iterable<string>) {
  try {
    localStorage.setItem(VISIBLE_KEY, JSON.stringify([...ids]))
  } catch {
    // quota
  }
}