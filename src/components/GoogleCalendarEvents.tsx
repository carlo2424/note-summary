import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import { formatIsoDate } from '../utils/format'
import type { GoogleCalendarEvent } from '../utils/googleCalendar'

function formatWhen(event: GoogleCalendarEvent): string {
  if (event.endDate !== event.startDate) {
    return `${formatIsoDate(event.startDate)} – ${formatIsoDate(event.endDate)} · ${event.whenLabel}`
  }
  return `${formatIsoDate(event.startDate)} · ${event.whenLabel}`
}

/** Elenco in sola lettura. Non crea impegni locali. */
export function GoogleCalendarEvents() {
  const snap = useGoogleCalendar(true)
  if (!snap.connected && snap.events.length === 0 && !snap.error) return null

  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Calendario Google
        </h3>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          Sola lettura
        </span>
      </div>
      {snap.error && (
        <p className="mb-2 text-xs text-rose-600">{snap.error}</p>
      )}
      {snap.events.length === 0 ? (
        <p className="text-xs text-slate-400">
          {snap.connected
            ? 'Nessun evento in arrivo.'
            : 'Nessun evento salvato.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {snap.events.map((event) => (
            <li key={event.id} className="rounded-lg bg-slate-50 px-2 py-1.5">
              {event.htmlLink ? (
                <a
                  href={event.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-slate-800 hover:underline"
                >
                  {event.title}
                </a>
              ) : (
                <p className="line-clamp-3 break-words text-sm font-medium text-slate-800">
                  {event.title}
                </p>
              )}
              <p className="truncate text-[11px] text-sky-700">
                Google · {formatWhen(event)}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
