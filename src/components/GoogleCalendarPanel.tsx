import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  envClientId,
  readStoredClientId,
  setStoredClientId,
} from '../utils/googleCalendar'

/** Client ID pubblico del progetto Google già configurato (solo Note Summary). */
const NOTE_SUMMARY_CLIENT_ID =
  '256407792814-2bi35pru7cbur3su0rgi29e57efs66pn.apps.googleusercontent.com'

export function GoogleCalendarPanel() {
  const snap = useGoogleCalendar(false)
  const [clientId, setClientId] = useState(
    () => readStoredClientId() || envClientId() || NOTE_SUMMARY_CLIENT_ID,
  )
  const origin = window.location.origin
  const envFallback = envClientId()

  function updateClientId(value: string) {
    setClientId(value)
    setStoredClientId(value)
  }

  async function handleConnect() {
    try {
      await connectGoogleCalendar(clientId)
    } catch {
      // Il messaggio è già nello stato visibile del pannello.
    }
  }

  function handleDisconnect() {
    const ok = window.confirm(
      'Scollegare il calendario Google? Gli eventi salvati in sola lettura spariranno da questa app. Su Google non viene modificato nulla.',
    )
    if (!ok) return
    disconnectGoogleCalendar()
  }

  const statusText = snap.error
    ? snap.error
    : snap.connected
      ? 'Collegato'
      : 'Non collegato'
  const canDisconnect = snap.connected || snap.events.length > 0

  return (
    <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            Calendario Google
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            Sola lettura del calendario principale. Gli impegni locali non
            vengono inviati a Google.
          </p>
        </div>
      </div>

      <ol className="mb-3 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-slate-500">
        <li>
          Nella{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-700 underline"
          >
            console Google
          </a>
          , apri il client OAuth «Applicazione web».
        </li>
        <li>
          Aggiungi tra le origini JavaScript autorizzate e salva:{' '}
          <span className="font-mono text-slate-800">{origin}</span>
          {origin !== 'https://carlo2424.github.io' && (
            <>
              {' '}
              e, per il telefono fuori casa,{' '}
              <span className="font-mono text-slate-800">
                https://carlo2424.github.io
              </span>
            </>
          )}
          .
        </li>
        <li>
          Qui sotto il Client ID è già compilato. Premi «Collega calendario»,
          consenti i popup, poi Continua su Google (app in test).
        </li>
      </ol>

      <label className="mb-1 block text-xs font-medium text-slate-600">
        Client ID OAuth
      </label>
      <input
        type="text"
        value={clientId}
        onChange={(e) => updateClientId(e.target.value)}
        placeholder="xxxx.apps.googleusercontent.com"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:border-sky-400 focus:ring-sky-500"
      />
      {!clientId.trim() && envFallback && (
        <p className="mb-2 text-[11px] text-slate-400">
          Campo vuoto: verrà usato il Client ID di VITE_GOOGLE_CLIENT_ID.
        </p>
      )}

      <p
        className={`text-xs ${
          snap.error
            ? 'text-rose-600'
            : snap.connected
              ? 'text-emerald-700'
              : 'text-slate-500'
        }`}
      >
        {statusText}
      </p>
      {snap.connected && snap.fetchedAt && !snap.error && (
        <p className="mt-1 text-[11px] text-slate-400">
          Aggiornato{' '}
          {new Date(snap.fetchedAt).toLocaleString('it-IT', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={snap.busy}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {snap.busy ? 'Collegamento…' : 'Collega calendario'}
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={snap.busy || !canDisconnect}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Scollega
        </button>
      </div>
    </section>
  )
}
