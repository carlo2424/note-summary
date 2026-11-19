export type CalendarMarkerType =
  | 'event'
  | 'note'
  | 'task'
  | 'expense'
  | 'google'

export type CalendarDayItem = {
  type: CalendarMarkerType
  id?: number | string
  title: string
  subtitle?: string
  sortKey?: string
}

export const CALENDAR_MARKER_STYLE: Record<
  CalendarMarkerType,
  { dot: string; label: string }
> = {
  event: { dot: 'bg-indigo-500', label: 'Impegni' },
  google: { dot: 'bg-sky-500', label: 'Google' },
  note: { dot: 'bg-amber-500', label: 'Note' },
  task: { dot: 'bg-emerald-500', label: 'Attività' },
  expense: { dot: 'bg-rose-500', label: 'Spese' },
}

const TYPE_ORDER: CalendarMarkerType[] = [
  'event',
  'google',
  'note',
  'task',
  'expense',
]

export function localIsoFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDay(
  map: Map<string, Set<CalendarMarkerType>>,
  iso: string,
  type: CalendarMarkerType,
) {
  if (!map.has(iso)) map.set(iso, new Set())
  map.get(iso)!.add(type)
}

function eventMarkerIso(event: {
  startDate: string
  endDate?: string
  renewalDate?: string
}): string | undefined {
  return event.renewalDate ?? event.endDate ?? event.startDate
}

function noteMarkerIso(note: { startDate?: string; endDate?: string }): string | undefined {
  return note.endDate ?? note.startDate
}

type MarkerInput = {
  events?: {
    id?: number
    title: string
    startDate: string
    endDate?: string
    renewalDate?: string
  }[]
  notes?: {
    id?: number
    title: string
    startDate?: string
    endDate?: string
  }[]
  tasks?: {
    id?: number
    title: string
    dueDate?: string
    listId?: number
    done: boolean
  }[]
  taskLists?: { id?: number; title?: string; dueDate?: string }[]
  expenses?: {
    id?: number
    description: string
    date: string
    amount: number
  }[]
  googleEvents?: {
    id: string
    title: string
    startDate: string
    endDate: string
    whenLabel: string
  }[]
}

export function buildCalendarMarkers(input: MarkerInput): Map<string, CalendarMarkerType[]> {
  const map = new Map<string, Set<CalendarMarkerType>>()

  for (const event of input.events ?? []) {
    const iso = eventMarkerIso(event)
    if (iso) addDay(map, iso, 'event')
  }

  for (const note of input.notes ?? []) {
    const iso = noteMarkerIso(note)
    if (iso) addDay(map, iso, 'note')
  }

  const listDueById = new Map<number, string>()
  for (const list of input.taskLists ?? []) {
    if (list.id && list.dueDate) listDueById.set(list.id, list.dueDate)
  }

  for (const task of input.tasks ?? []) {
    if (task.done) continue
    const due = task.dueDate ?? (task.listId ? listDueById.get(task.listId) : undefined)
    if (due) addDay(map, due, 'task')
  }

  for (const expense of input.expenses ?? []) {
    if (expense.date) addDay(map, expense.date.slice(0, 10), 'expense')
  }

  for (const event of input.googleEvents ?? []) {
    forEachGoogleDay(event, (iso) => addDay(map, iso, 'google'))
  }

  const result = new Map<string, CalendarMarkerType[]>()
  for (const [iso, types] of map) {
    result.set(iso, [...types])
  }
  return result
}

export function formatCalendarDayTitle(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function compareDayItems(a: CalendarDayItem, b: CalendarDayItem): number {
  const typeDiff =
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
  if (typeDiff !== 0) return typeDiff
  if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) {
    return a.sortKey.localeCompare(b.sortKey)
  }
  return a.title.localeCompare(b.title, 'it-IT')
}

/** Voci visibili nel calendario per un giorno (ISO locale). */
export function getCalendarDayItems(
  iso: string,
  input: MarkerInput,
): CalendarDayItem[] {
  const items: CalendarDayItem[] = []

  for (const event of input.events ?? []) {
    const eventIso = eventMarkerIso(event)
    if (eventIso !== iso) continue
    items.push({
      type: 'event',
      id: event.id,
      title: event.title,
      subtitle: event.renewalDate ? 'Rinnovo' : undefined,
    })
  }

  for (const note of input.notes ?? []) {
    const noteIso = noteMarkerIso(note)
    if (noteIso !== iso) continue
    items.push({
      type: 'note',
      id: note.id,
      title: note.title,
    })
  }

  const listDueById = new Map<number, string>()
  const listTitleById = new Map<number, string>()
  for (const list of input.taskLists ?? []) {
    if (list.id && list.dueDate) listDueById.set(list.id, list.dueDate)
    if (list.id && list.title) listTitleById.set(list.id, list.title)
  }

  for (const task of input.tasks ?? []) {
    if (task.done) continue
    const due =
      task.dueDate ??
      (task.listId ? listDueById.get(task.listId) : undefined)
    if (due !== iso) continue
    items.push({
      type: 'task',
      id: task.id,
      title: task.title,
      subtitle: task.listId
        ? listTitleById.get(task.listId)
        : undefined,
    })
  }

  for (const expense of input.expenses ?? []) {
    if (!expense.date || expense.date.slice(0, 10) !== iso) continue
    items.push({
      type: 'expense',
      id: expense.id,
      title: expense.description,
      subtitle:
        expense.amount < 0
          ? `+${Math.abs(expense.amount).toFixed(2).replace('.', ',')} €`
          : `−${expense.amount.toFixed(2).replace('.', ',')} €`,
    })
  }

  for (const event of input.googleEvents ?? []) {
    if (!googleEventCoversDay(event, iso)) continue
    items.push({
      type: 'google',
      id: event.id,
      title: event.title,
      subtitle: `Google · ${event.whenLabel}`,
      sortKey:
        event.whenLabel === 'tutto il giorno'
          ? `0-${event.title}`
          : `1-${event.whenLabel}-${event.title}`,
    })
  }

  return items.sort(compareDayItems)
}

function shiftIso(iso: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + days)
  return localIsoFromDate(date)
}

/** Finestra visibile: il mese corrente e quelli vicini, anche se l’evento è lungo. */
function googleEventCoversDay(
  event: { startDate: string; endDate: string },
  iso: string,
): boolean {
  const last = event.endDate >= event.startDate ? event.endDate : event.startDate
  if (iso < event.startDate || iso > last) return false
  const today = localIsoFromDate(new Date())
  const windowStart = shiftIso(today, -45)
  const windowEnd = shiftIso(today, 120)
  if (!windowStart || !windowEnd) return false
  return iso >= windowStart && iso <= windowEnd
}

function forEachGoogleDay(
  event: { startDate: string; endDate: string },
  visit: (iso: string) => void,
) {
  const last = event.endDate >= event.startDate ? event.endDate : event.startDate
  const today = localIsoFromDate(new Date())
  const windowStart = shiftIso(today, -45)
  const windowEnd = shiftIso(today, 120)
  if (!windowStart || !windowEnd) return
  let cursor = event.startDate > windowStart ? event.startDate : windowStart
  const stop = last < windowEnd ? last : windowEnd
  for (let i = 0; i < 200 && cursor <= stop; i++) {
    visit(cursor)
    const next = shiftIso(cursor, 1)
    if (!next || next <= cursor) break
    cursor = next
  }
}

export function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7

  const cells: { iso: string | null; day: number | null }[] = []
  for (let i = 0; i < startPad; i++) cells.push({ iso: null, day: null })
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d)
    cells.push({ iso: localIsoFromDate(date), day: d })
  }
  return cells
}
